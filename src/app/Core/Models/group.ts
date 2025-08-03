export interface Group {
    name: string,
    description: string,
    memberNum: number,
    questCreateTime: Date,
    questList: string[],
    questSuccessNum: number[],
    currentActivateUserNum: number,
    clubList: string[]
}