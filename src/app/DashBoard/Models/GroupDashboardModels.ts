export interface Quest {
  id: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  status: 'pending' | 'in-progress' | 'completed' | 'not-started';
}

export interface Stat {
  id: string;
  label: string;
  value: number;
  icon: string;
  unit: string;
}