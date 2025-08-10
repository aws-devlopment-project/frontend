export interface UserCredentials {
    id: string,
    name: string,
    idToken: string
}

export interface UserJoin {
    id: string,
    joinList: {
        groupId: number,
        groupname: string,
        clubList: {
            clubId: number,
            name: string,
            createdAt: Date,
            updatedAt: Date,
        }[],
    }[]
}

export interface UserQuestCur {
    id: string,
    curQuestTotalList: {
        quest: string,
        group: string,
        club: string,
        tag?: [],
        descriptions?: string
        isSuccess: boolean
    }[]
}

export interface UserQuestContinuous {
    id: string,
    continuousSuccessQuestList: {
        days: number,
        totalQuestNum: number,
        successQuestNum: number
    }
}

export interface UserQuestPrev {
    id: string,
    prevQuestTotalList: {
        quest: string,
        group: string,
        isSuccess: boolean,
        completeTime: Date,
    }[]
}

export interface UserQuestWeekly {
    id: string,
    weeklyQuestList: {
        day: number,
        questTotalNum: number,
        successQuestNum: number,
        bestParticipateGroup: string,
    }[]
}

export interface UserStatus {
    id: string;
    name: string;
    avatar?: string;
    status: 'online' | 'offline' | 'away';
    joinDate?: Date;
    lastSeen?: Date;
}