import cv2
import mediapipe as mp
import time
import numpy as np

# ------------------- MediaPipe Setup -------------------
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

mp_drawing = mp.solutions.drawing_utils

# ------------------- Counters & State -------------------
smile_count = 0
total_gestures = 0
eye_touch_count = 0
prev_smiling = False
prev_hand_raised = {"left": False, "right": False}
last_smile_time = 0
eye_touch_cooldown = 0
start_time = time.time()

SMILE_COOLDOWN = 2.0

# ------------------- Detection Functions -------------------
def fingers_extended(hand_landmarks):
    # Determine if fingers are extended
    extended = []
    tips_ids = [4, 8, 12, 16, 20]
    for tip_id in tips_ids:
        tip = hand_landmarks.landmark[tip_id]
        dip = hand_landmarks.landmark[tip_id - 2]  # DIP joint (two indices behind tip)
        # For thumb (id=4), compare x coordinate since thumb is sideways
        if tip_id == 4:
            extended.append(tip.x < dip.x)  # Adjust condition for left/right hand later
        else:
            extended.append(tip.y < dip.y)
    return extended

def is_smiling(landmarks):
    left = np.array([landmarks[61].x, landmarks[61].y])
    right = np.array([landmarks[291].x, landmarks[291].y])
    upper = np.array([landmarks[13].x, landmarks[13].y])
    lower = np.array([landmarks[14].x, landmarks[14].y])
    
    mouth_width = np.linalg.norm(left - right)
    mouth_height = np.linalg.norm(upper - lower)
    mar = mouth_height / mouth_width if mouth_width > 0 else 0

    # Smiling involves mouth getting wider horizontally and slightly open vertically
    # A higher MAR is more open mouth; typically smiling means MAR > a threshold
    # Using 0.3 as a threshold for smiling detection
    return mar > 0.3

def is_hand_gesture(hand_landmarks):
    # Basic detection of hand gesture defined as at least one finger extended except thumb
    extended = fingers_extended(hand_landmarks)
    # Consider hand gesture True if any finger except thumb extended
    return any(extended[1:])  # ignore thumb (index 0)

def is_hand_raised(hand_landmarks, face_landmarks):
    if not hand_landmarks or not face_landmarks:
        return False, False
    
    nose_y = face_landmarks.landmark[1].y
    
    left_raised = right_raised = False
    for hand in hand_landmarks:
        wrist_y = hand.landmark[0].y
        if wrist_y < nose_y - 0.15:  # hand above nose level
            if hand.landmark[0].x < 0.5:
                left_raised = True
            else:
                right_raised = True
    return left_raised, right_raised

def is_eye_touched(hand_landmarks, face_landmarks):
    if not hand_landmarks or not face_landmarks:
        return False
    
    left_eye = np.mean([[face_landmarks.landmark[i].x, face_landmarks.landmark[i].y] 
                        for i in [33, 133, 160, 159]], axis=0)
    right_eye = np.mean([[face_landmarks.landmark[i].x, face_landmarks.landmark[i].y] 
                         for i in [263, 362, 387, 386]], axis=0)
    
    for hand in hand_landmarks:
        tip = hand.landmark[8]  # index finger tip
        if (np.linalg.norm([tip.x - left_eye[0], tip.y - left_eye[1]]) < 0.06 or
            np.linalg.norm([tip.x - right_eye[0], tip.y - right_eye[1]]) < 0.06):
            return True
    return False

# ------------------- Main Loop -------------------
cap = cv2.VideoCapture(0)
# Set camera resolution to 640x480 for faster processing
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
print("Camera started! Press 'q' to stop and get your report.")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break
        
    frame = cv2.flip(frame, 1)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    face_results = face_mesh.process(rgb_frame)
    hand_results = hands.process(rgb_frame)
    
    feedback_text = []
    
    if face_results.multi_face_landmarks:
        for face_landmarks in face_results.multi_face_landmarks:
            landmarks = face_landmarks.landmark
            
            # Smile
            smiling = is_smiling(landmarks)
            if smiling and not prev_smiling and (time.time() - last_smile_time > SMILE_COOLDOWN):
                smile_count += 1
                last_smile_time = time.time()
                feedback_text.append("SMILE DETECTED!")
            prev_smiling = smiling
            
            # Hand Gestures
            if hand_results.multi_hand_landmarks:
                for idx, hand_landmark in enumerate(hand_results.multi_hand_landmarks):
                    # Determine hand label
                    hand_label = None
                    if hand_results.multi_handedness:
                        hand_label = hand_results.multi_handedness[idx].classification[0].label.lower()
                    if hand_label not in ["left", "right"]:
                        continue
                    gesture_detected = is_hand_gesture(hand_landmark)
                    if gesture_detected and not prev_hand_raised.get(hand_label, False):
                        total_gestures += 1
                        feedback_text.append(f"{hand_label.capitalize()} hand gesture!")
                    prev_hand_raised[hand_label] = gesture_detected
            else:
                prev_hand_raised["left"] = False
                prev_hand_raised["right"] = False
            
            # Eye Touch
            if eye_touch_cooldown > 0:
                eye_touch_cooldown -= 1
            if hand_results.multi_hand_landmarks and eye_touch_cooldown == 0:
                if is_eye_touched(hand_results.multi_hand_landmarks, face_landmarks):
                    eye_touch_count += 1
                    eye_touch_cooldown = 30
                    feedback_text.append("Avoid touching eyes!")

    # Display live feedback
    cv2.putText(frame, f"Smiles: {smile_count}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(frame, f"Gestures: {total_gestures}", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 0), 2)
    cv2.putText(frame, f"Eye Touches: {eye_touch_count}", (10, 110), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    
    for i, text in enumerate(feedback_text[-3:]):
        cv2.putText(frame, text, (10, 160 + i*40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 255), 3)
    
    cv2.imshow("Interview Gesture Coach - Press Q to Finish", frame)
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ------------------- Final Report -------------------
duration = (time.time() - start_time) / 60
cap.release()
cv2.destroyAllWindows()

print("\n" + "="*50)
print("       INTERVIEW GESTURE ANALYSIS REPORT")
print("="*50)
print(f"Duration: {duration:.1f} minutes")
print(f"Smiles detected       : {smile_count} → ", end="")
print("EXCELLENT!" if smile_count >= duration * 1.2 else "Smile more!" if smile_count > 0 else "No smiles detected")

print(f"Hand gestures used    : {total_gestures} → ", end="")
print("PERFECT!" if total_gestures >= duration * 2 else "Good" if total_gestures > 0 else "Use your hands more!")

print(f"Eye/face touching     : {eye_touch_count} → ", end="")
print("Great discipline!" if eye_touch_count == 0 else "Avoid touching face!")

print("="*50)
print("You are now ready to crush your interview!")