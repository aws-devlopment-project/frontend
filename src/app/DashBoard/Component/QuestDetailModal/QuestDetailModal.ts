import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { Inject } from "@angular/core";
import { MatDialogRef, MAT_DIALOG_DATA } from "@angular/material/dialog";

interface DailyQuest {
  id: string;
  title: string;
  groupName: string;
  isCompleted: boolean;
  priority: 'high' | 'medium' | 'low';
  dueTime?: string;
}

// 퀘스트 상세 모달 컴포넌트
@Component({
  selector: 'app-quest-detail-modal',
  templateUrl: './QuestDetailModal.html',
  styleUrl: './QuestDetailModal.css',
  imports: [CommonModule, MatIconModule],
  standalone: true
})
export class QuestDetailModalComponent {
  constructor(
    @Inject(MatDialogRef) public dialogRef: MatDialogRef<QuestDetailModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { 
      date: string; 
      quests: DailyQuest[]; 
      onQuestClick: (quest: DailyQuest) => void; 
      onMarkCompleted: (quest: DailyQuest) => void 
    }
  ) {}

  closeModal(): void {
    this.dialogRef.close();
  }

  onQuestClick(quest: DailyQuest): void {
    this.data.onQuestClick(quest);
    this.closeModal();
  }

  markAsCompleted(quest: DailyQuest): void {
    this.data.onMarkCompleted(quest);
  }

  getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'high': return '🔥';
      case 'medium': return '⭐';
      case 'low': return '💡';
      default: return '📋';
    }
  }
}