import { Club } from "./club"

export interface Group {
    id: number,
    name: string,
    description: string,
    icon: string,
    memberNum: number,
    questCreateTime: Date,
    questList: string[],
    questSuccessNum: number[],
    currentActivateUserNum?: number,
    clubList: Club[],
    tag: string[]
}

export function createGroup(): Group {
    return {
        id: -1,
        name: '전체',
        description: '전체 그룹',
        icon: '전체 그룹',
        memberNum: 0,
        questCreateTime: new Date(),
        questList: [],
        questSuccessNum: [],
        currentActivateUserNum: 0,
        clubList: [],
        tag: []
    };
}

export function createGroupList(): Group[] {
    return [];
}