export interface Group {
    id: number,
    name: string,
    description?: string,
    icon?: string,
    memberNum: number,
    questCreateTime: Date,
    questList: string[],
    questSuccessNum: number[],
    currentActivateUserNum?: number,
    clubList: {
        name: string,
        description?: string,
        icon?: string,
        memberNum: number,
        tag: []
    }[],
    tag: string[]
}