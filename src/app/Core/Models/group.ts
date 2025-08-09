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