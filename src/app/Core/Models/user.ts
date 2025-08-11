export interface UserCredentials {
    id: string,
    name: string,
    idToken: string
}

export function createUserCredentials(): UserCredentials {
    return {
        id: 'default',
        name: '',
        idToken: ''
    };
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

export function createUserJoin(): UserJoin {
    return {
        id: 'default',
        joinList: []
    };
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

export function createUserQuestCur(): UserQuestCur {
    return {
        id: 'default',
        curQuestTotalList: []
    };
}

export interface UserQuestContinuous {
    id: string,
    continuousSuccessQuestList: {
        days: number,
        totalQuestNum: number,
        successQuestNum: number
    }
}

export function createUserQuestContinuous(): UserQuestContinuous {
    return {
        id: 'default',
        continuousSuccessQuestList: {
            days: 0,
            totalQuestNum: 0,
            successQuestNum: 0
        }
    };
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

export function createUserQuestPrev() {
    return {
        id: 'default',
        prevQuestTotalList: []
    };
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

export function createUserQuestWeekly() {
    return {
        id: 'default',
        weeklyQuestList: []
    };
}

export interface UserStatus {
    id: string;
    name: string;
    avatar?: string;
    status: 'online' | 'offline' | 'away';
    joinDate?: Date;
    lastSeen?: Date;
}

export function createUserStatus(): UserStatus {
    return {
        id: 'default',
        name: '',
        avatar: '',
        status: 'offline',
        joinDate: new Date(),
        lastSeen: new Date()
    }
}