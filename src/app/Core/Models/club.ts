export interface Club {
    name: string,
    description: string,
    memberNum: number,
    clubQuest?: [],
    recentlyMessage?: [],
    tag: string[]
}

export interface ClubChat {
    name: string,
    clubname: string,
    recentlyMessage: {
        createTime: number,
        writer: string,
        tag: string,
        message: string,
    }
}