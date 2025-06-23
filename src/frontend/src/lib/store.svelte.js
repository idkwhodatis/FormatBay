const store=$state({
    init:false,
    favorite:[],
    tasks:{},
    selectedTask:null
});
export default store;

export const consts={
    formats:{
        Video:["mp4","mkv"],
        Audio:["mp3","flac","wav","acc"],
        OCR:["txt","pdf"],
        Text:["md","pdf"],
        Data:["json","yaml","xml","csv","xlsx"],
        Certificate:["crt","pem"]
    },
    locales:{
        "en-us":"English",
        "zh-cn":"简体中文"
    }
};