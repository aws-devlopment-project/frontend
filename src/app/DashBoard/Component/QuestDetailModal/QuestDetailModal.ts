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

// 인터페이스 수정: displayDate 추가
interface ModalData {
  date: string;           // 원본 날짜 (YYYY-MM-DD)
  displayDate?: string;   // 표시용 날짜 (한국어 형식)
  quests: DailyQuest[];
  onQuestClick: (quest: DailyQuest) => void;
}

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
    @Inject(MAT_DIALOG_DATA) public data: ModalData
  ) {}

  closeModal(): void {
    this.dialogRef.close();
  }

  onQuestClick(quest: DailyQuest): void {
    this.data.onQuestClick(quest);
    this.closeModal();
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