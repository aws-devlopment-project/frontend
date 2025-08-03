export interface Club {
    name: string,
    description: string,
    userNum: number,
    clubQuest: [],
    recentlyMessage: []
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