
export enum InterviewState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  ACTIVE = 'ACTIVE',
  ANALYZING = 'ANALYZING',
  FEEDBACK = 'FEEDBACK',
  ERROR = 'ERROR'
}

export enum InterviewType {
  SOFTWARE_ENGINEER = 'Software Engineer',
  PRODUCT_MANAGER = 'Product Manager',
  DATA_SCIENTIST = 'Data Scientist',
  UX_DESIGNER = 'UX Designer',
  SALES_REP = 'Sales Representative',
  PROJECT_MANAGER = 'Project Manager',
  BUSINESS_ANALYST = 'Business Analyst',
  MARKETING_SPECIALIST = 'Marketing Specialist',
  RETAIL_ASSOCIATE = 'Retail Associate',
  CUSTOMER_SUPPORT = 'Customer Support',
  HR_SPECIALIST = 'HR Specialist',
  FINANCIAL_ANALYST = 'Financial Analyst',
  OPERATIONS_MANAGER = 'Operations Manager',
  CONSULTANT = 'Management Consultant',
  EXECUTIVE_ASSISTANT = 'Executive Assistant',
  NURSE = 'Registered Nurse',
  TEACHER = 'Teacher/Educator'
}

export enum InterviewerPersona {
  FRIENDLY = 'Friendly Recruiter',
  STRICT = 'Strict Technical Lead',
  BEHAVIORAL = 'Behavioral HR Specialist'
}

export interface InterviewConfig {
  type: InterviewType;
  persona: InterviewerPersona;
  context: string; 
  resumeText?: string;
  enableGestures: boolean; // New config
}

export interface GestureMetrics {
  smileCount: number;
  eyeTouchCount: number;
  handGestureCount: number;
}

export interface FeedbackData {
  score: number;
  strengths: string[];
  improvements: string[];
  metrics: {
    technical: number;
    communication: number;
    confidence: number;
    clarity: number;
    problemSolving: number;
  };
  gestureMetrics?: GestureMetrics; // Optional, only if enabled
  summary: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
