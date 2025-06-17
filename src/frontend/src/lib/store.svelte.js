const store=$state({
    init:false,
    favorite:[],
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
    }
};