
import { FilesetResolver, FaceLandmarker, HandLandmarker } from "@mediapipe/tasks-vision";

// Configuration Constants
const VISION_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm";
const DEBOUNCE_MS = 1500; // Time between counting same gesture
const SMILE_THRESHOLD = 0.55; 
const EYE_TOUCH_THRESHOLD = 0.18; 

export class GestureService {
  private faceLandmarker: FaceLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private isInitializing = false;
  private isReady = false;
  
  // Singleton promise to prevent race conditions during double-init
  private initPromise: Promise<void> | null = null;

  // State Tracking for Debouncing
  private lastSmileTime = 0;
  private lastEyeTouchTime = 0;
  private lastGestureTime = 0;
  
  private isCurrentlySmiling = false;
  private isCurrentlyTouchingEye = false;
  private isCurrentlyGesturing = false;
  
  // Video Frame Timing
  private lastVideoTime = -1;

  // Metrics
  public metrics = {
    smileCount: 0,
    eyeTouchCount: 0,
    handGestureCount: 0,
  };
  
  isServiceReady() {
    return this.isReady;
  }

  async initialize() {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.isInitializing = true;
    
    // Suppress TFLite and MediaPipe spam (logs, info, and specific warnings)
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;

    // Aggressively filter INFO logs from TensorFlow/WASM
    console.log = (...args) => {
        const msg = args.join(' ');
        if (msg.includes("INFO: Created TensorFlow Lite") || msg.includes("XNNPACK")) {
            return;
        }
        originalLog.apply(console, args);
    };

    console.info = (...args) => {
         const msg = args.join(' ');
         if (msg.includes("Created TensorFlow Lite") || msg.includes("XNNPACK")) {
             return;
         }
         originalInfo.apply(console, args);
    };
    
    // Filter out specific harmless WASM warnings
    console.warn = (...args) => {
        const msg = args.join(' ');
        if (
            msg.includes("face_landmarker_graph") || 
            msg.includes("gl_context") || 
            msg.includes("xnnpack") ||
            msg.includes("FaceBlendshapesGraph")
        ) {
            return;
        }
        originalWarn.apply(console, args);
    };

    this.initPromise = (async () => {
        try {
            const vision = await FilesetResolver.forVisionTasks(VISION_BASE_URL);

            this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
                delegate: "GPU"
                },
                outputFaceBlendshapes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });

            this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
                },
                runningMode: "VIDEO",
                numHands: 2
            });

            this.isReady = true;
        } catch (error) {
            console.error("Gesture Service Init Failed:", error);
            this.isReady = false;
            // Allow retry later
            this.initPromise = null;
        } finally {
            // Restore consoles
            console.log = originalLog;
            console.info = originalInfo;
            console.warn = originalWarn;
            this.isInitializing = false;
        }
    })();

    return this.initPromise;
  }

  reset() {
    this.metrics = {
      smileCount: 0,
      eyeTouchCount: 0,
      handGestureCount: 0,
    };
    this.lastSmileTime = 0;
    this.lastEyeTouchTime = 0;
    this.lastGestureTime = 0;
    this.isCurrentlySmiling = false;
    this.isCurrentlyTouchingEye = false;
    this.isCurrentlyGesturing = false;
    this.lastVideoTime = -1;
  }

  detect(videoElement: HTMLVideoElement) {
    if (!this.isReady || !this.faceLandmarker || !this.handLandmarker) return;

    // Use performance.now() to ensure strictly increasing timestamps
    // for the vision model, which is safer than videoElement.currentTime for live streams
    const now = performance.now();
    
    // Skip if we are processing too fast or duplicate frame time (though perf.now changes)
    if (now <= this.lastVideoTime) return;
    this.lastVideoTime = now;

    const faceResult = this.faceLandmarker.detectForVideo(videoElement, now);
    const handResult = this.handLandmarker.detectForVideo(videoElement, now);

    // --- METRICS LOGIC ---
    if (faceResult.faceLandmarks.length > 0) {
      const landmarks = faceResult.faceLandmarks[0];
      
      // --- SMILE LOGIC ---
      const leftMouth = landmarks[61];
      const rightMouth = landmarks[291];
      const leftFace = landmarks[234];
      const rightFace = landmarks[454];

      const mouthWidth = Math.sqrt(Math.pow(rightMouth.x - leftMouth.x, 2) + Math.pow(rightMouth.y - leftMouth.y, 2));
      const faceWidth = Math.sqrt(Math.pow(rightFace.x - leftFace.x, 2) + Math.pow(rightFace.y - leftFace.y, 2));

      if ((mouthWidth / faceWidth) > SMILE_THRESHOLD) {
        if (!this.isCurrentlySmiling && (Date.now() - this.lastSmileTime > DEBOUNCE_MS)) {
          this.metrics.smileCount++;
          this.lastSmileTime = Date.now();
          this.isCurrentlySmiling = true;
        }
      } else {
        this.isCurrentlySmiling = false;
      }

      // --- EYE TOUCH LOGIC ---
      if (handResult.landmarks.length > 0) {
        const leftEye = landmarks[468];
        const rightEye = landmarks[473];
        let touching = false;

        for (const hand of handResult.landmarks) {
            const indexTip = hand[8]; 
            const distLeft = Math.sqrt(Math.pow(indexTip.x - leftEye.x, 2) + Math.pow(indexTip.y - leftEye.y, 2));
            const distRight = Math.sqrt(Math.pow(indexTip.x - rightEye.x, 2) + Math.pow(indexTip.y - rightEye.y, 2));

            const normLeft = distLeft / faceWidth;
            const normRight = distRight / faceWidth;

            if (normLeft < EYE_TOUCH_THRESHOLD || normRight < EYE_TOUCH_THRESHOLD) {
                touching = true;
            }
        }

        if (touching) {
             if (!this.isCurrentlyTouchingEye && (Date.now() - this.lastEyeTouchTime > DEBOUNCE_MS)) {
                this.metrics.eyeTouchCount++;
                this.lastEyeTouchTime = Date.now();
                this.isCurrentlyTouchingEye = true;
             }
        } else {
             this.isCurrentlyTouchingEye = false;
        }
      }

    } 

    // --- HAND GESTURE LOGIC (General movement) ---
    if (handResult.landmarks.length > 0) {
        if (!this.isCurrentlyGesturing && (Date.now() - this.lastGestureTime > 3000)) {
             this.metrics.handGestureCount++;
             this.lastGestureTime = Date.now();
             this.isCurrentlyGesturing = true;
        }
    } else {
        this.isCurrentlyGesturing = false;
    }
  }

  getMetrics() {
    return { ...this.metrics };
  }
}

export const gestureService = new GestureService();
