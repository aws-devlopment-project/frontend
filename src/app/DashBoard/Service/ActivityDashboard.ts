import { Injectable } from "@angular/core";
import { UserService } from "../../Core/Service/UserService";
import { UserQuestPrev, UserQuestCur, UserQuestContinuous, UserQuestWeekly } from "../../Core/Models/user";

interface DailyActivity {
  date: string;
  completed: number;
  target: number;
}

interface WeeklyPattern {
  day: string;
  hours: number;
  totalActivities: number;
}

@Injectable({
    providedIn: 'platform'
})
export class ActivityDashboardService {
    constructor(readonly userService: UserService) {

    }

    async getQuestScore(): Promise<number[]> {
        const userQuestPrev: UserQuestPrev | null = await this.userService.getUserQuestPrev();
        const userQuestCur: UserQuestCur | null = await this.userService.getUserQuestCur();
        const userQuestContinuous: UserQuestContinuous | null = await this.userService.getUserQuestContinuous();
        let totalSuccess = 0;

        if (!(userQuestPrev && userQuestContinuous && userQuestCur)) {
            return [0, 0, 0, 0];
        }
        const days = userQuestContinuous.continuousSuccessQuestList.days;
        totalSuccess = userQuestContinuous.continuousSuccessQuestList.successQuestNum;
        let totalSuccessInWeeks = 0;
        userQuestPrev.prevQuestTotalList.forEach((quest) => {
            if (quest.success) {
                totalSuccessInWeeks++;
            }
        })
        const score = this.calculateTotalScore();
        const completeRateForWeeks = Math.floor(totalSuccessInWeeks / userQuestPrev.prevQuestTotalList.length * 100);
        return [days, totalSuccess, completeRateForWeeks, score];
    }

    // [Make] : 계산식 만들어야 함
    calculateTotalScore() {
        return 8.5;
    }

    async pastDailyComplete(): Promise<DailyActivity[]> {
        let successCount: DailyActivity[] = [
            {date: '일', completed: 0, target: 0},
            {date: '월', completed: 0, target: 0},
            {date: '화', completed: 0, target: 0},
            {date: '수', completed: 0, target: 0},
            {date: '목', completed: 0, target: 0},
            {date: '금', completed: 0, target: 0},
            {date: '토', completed: 0, target: 0}
        ];
        const userQuestPrev: UserQuestPrev | null = await this.userService.getUserQuestPrev();

        if (!userQuestPrev)
            return successCount;
        userQuestPrev.prevQuestTotalList.forEach((quest) => {
            let date = new Date(quest.completeTime).getDay();
            successCount[date].target += 1;
            if (quest.success)
                successCount[date].completed += 1;
        })
        return successCount;
    }

    async getWeeklyPattern(): Promise<WeeklyPattern[]> {
        let weeklyPattern: WeeklyPattern[] = [
            {day: '일', hours: 0, totalActivities: 0},
            {day: '월', hours: 0, totalActivities: 0},
            {day: '화', hours: 0, totalActivities: 0},
            {day: '수', hours: 0, totalActivities: 0},
            {day: '목', hours: 0, totalActivities: 0},
            {day: '금', hours: 0, totalActivities: 0},
            {day: '토', hours: 0, totalActivities: 0}
        ];

        const weeklyQuestList: UserQuestWeekly | null = await this.userService.getUserQuestWeekly();

        if (!weeklyQuestList)
            return weeklyPattern;
        weeklyQuestList.weeklyQuestList.forEach((quest) => {
            weeklyPattern[quest.day].hours = quest.questTotalNum;
            weeklyPattern[quest.day].totalActivities = quest.successQuestNum;
        })
        return weeklyPattern;
    }

    async getBestType(): Promise<string[]> {
        let successList: string[] = [
            '운동',
            '월'
        ];

        const pattern = ["일", "월", "화", "수", "목", "금", "토"];
        const weeklyPattern: UserQuestWeekly | null = await this.userService.getUserQuestWeekly();

        if (!weeklyPattern)
            return successList;
        successList = [];
        weeklyPattern.weeklyQuestList.forEach((quest) => {
            if (quest.bestParticipateGroup)
                successList.push(quest.bestParticipateGroup);
        })
        let bestGroup = getMostFrequent(successList);
        if (bestGroup == undefined) {
            bestGroup = '0원 챌린지';
        }
        successList = [
            bestGroup,
            pattern[weeklyPattern.weeklyQuestList.sort((a, b) => b.successQuestNum - a.successQuestNum)[0].day]
        ];

        return successList;
    } 
}

function getMostFrequent<T>(arr: T[]): T | undefined {
  const countMap = new Map<T, number>();

  for (const item of arr) {
    countMap.set(item, (countMap.get(item) || 0) + 1);
  }

  let maxItem: T | undefined;
  let maxCount = 0;

  for (const [item, count] of countMap.entries()) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }

  return maxItem;
}
