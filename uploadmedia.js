var http = require("http");
var fs = require("fs");
var express = require("express");
var formidable = require("formidable");
var nodemailer = require("nodemailer");
var util = require("util");
var multiparty = require('multiparty');
var JSZip = require("jszip");
var jwt = require("jsonwebtoken");
var cookieParser = require('cookie-parser')
var ep = require('./js/forsecret.js');
var app = express();
var token;
var PORT = process.env.PORT || 5000;

app.use(express.static('css'));
app.use(express.static('images'));
app.use(express.json()); // for parsing application/json
app.use(express.urlencoded({
    extended: false
})); // for parsing application/x-www-form-urlencoded
app.use(cookieParser());


function addZero(i) {
    if (i < 10) {
        i = "0" + i;
    }
    return i;
}


app.get("/uploadpage", function (req, res) { // 取得 uploadmediaform.html 頁面
    const remote = res.socket.remoteAddress;
    const ip = remote.slice(remote.lastIndexOf(":") + 1);
    const port = res.socket.remotePort;
    console.log("remote request from => " + ip + ":" + port);
    fs.readFile("./uploadmediaform.html", function (err, data) {
        if (err) throw err;
        res.set({
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store, max-age=0'
        });
        // 開始設置 token
        token = jwt.sign({
            current_timestamp: Date.now()
        }, ep.secret, {
            expiresIn: 3600
        });
        // console.log(req.cookies);
        // console.log(req.headers);
        if (!('token' in req.cookies)) { // 如果 cookie 裡沒有 token 設置 token
            res.cookie("token", token);
        } else { // 如果有則驗證 token
            try {
                var verify = jwt.verify(req.cookies.token, ep.secret);
                if (verify != null) {
                    console.log("current token is vaild : ");
                    console.log(verify);
                }
            } catch (e) {
                res.cookie("token", token);
            }
        }
        // 結束設置 token
        res.send(data);
    });

});

app.get("/definelocation", function (req, res) {
    fs.readFile("./testgooglemap.html", function (err, data) {
        res.set({
            'Content-Type': 'text/html',
            'Cache-Control': 'no-store, max-age=0'
        });
        res.send(data);
    });
});

app.post("/upload", function (req, res, next) { // 傳送資料操作
    // 使用 header 做 auth
    // if(!req.headers.authorization || req.headers.authorization.indexOf('Bearer ') === -1){
    //     req.headers.authorization = "Bearer " + "123";
    //     // return res.status(401).json({ message: 'Missing Authorization Header' });
    //     next();
    // }

    if ('token' in req.cookies) { // 如果 cookie 裡有 token
        // var tk = req.headers.authorization.split(" ")[0];
        try {
            var verify = jwt.verify(req.cookies.token, ep.secret); // 驗證 token
            if (verify != null) {
                console.log(verify);
                next(); // 轉移控制權給下一個有相同 path 的路由
            } else {
                res.status(401).json({
                    error: 'Unauthorized'
                });
            }
        } catch (e) {
            res.status(401).json({
                error: 'Unauthorized'
            });
            console.log(e);
        }
    } else {
        res.status(401).json({
            error: 'Unauthorized'
        });
    }
});
// app.post("/upload", function (req, res) {
//     console.log("auth success");
//     // console.log(req.headers);
//     res.end();
// });
app.post("/upload", function (req, res) { // 處理 post request

    if (req.url === "/upload" && req.method.toLocaleLowerCase() === "post") {
        const remote = res.socket.remoteAddress;
        const ip = remote.slice(remote.lastIndexOf(":") + 1);
        const port = res.socket.remotePort;
        console.log("remote request from => " + ip + ":" + port);
        var date = new Date(Date.now());
        let dateStr = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate() + "T" + addZero(date.getHours()) + ":" + addZero(date.getMinutes()) + ":" + addZero(date.getSeconds());
        var folderPath = "folder_" + dateStr;
        // var folderPath = "";

        // var multipartyForm = new multiparty.Form();
        // multipartyForm.parse(req, function (err, fields, files) {
        //     if (err) throw err;
        //     console.log(fields);
        //     console.log(fields.driver_name[0] + "_" + folderPath);
        //     folderPath = fields.driver_name[0] + "_" + folderPath;
        //     // res.end(util.inspect({ fields: fields, files: files }));           
        // }); 

        fs.mkdirSync("./imagefolder/" + folderPath, {
            recursive: true
        });
        fs.mkdir("./logfolder/" + folderPath, {
            recursive: true
        }, function (err) { // 在 logfolder 裡建立資料夾
            if (err) throw err;
            fs.writeFileSync("logfolder/" + folderPath + "/process_log.txt", "");
            fs.writeFileSync("logfolder/" + folderPath + "/error_log.txt", "");
        });
        fs.mkdir("./zipfolder/", {
            recursive: true
        }, function (err) {
            if (err) throw err;
        })
        const form = new formidable.IncomingForm({
            uploadDir: "imagefolder/" + folderPath, // 檔案要上傳的目標資料夾
            keepExtensions: true,
            multiples: true,
            maxFileSize: 40 * 1024 * 1024
        });

        form.parse(req, function (err, fields, files) { // use nodemailer operation in form.parse's callback function 
            if (err) {
                writeErrorLog(err.stack);
                res.send("<script>alert('Somethong wrong with upload file (form.parse)')</script>");
            } else {
                console.log('!!!!!File uploaded!!!!');
                res.set('Content-Type', 'text/html')
                res.write("Loading...");
                console.log(util.inspect({
                    fields: fields,
                    files: files
                }));

                writeProcessLog("!!!!!File uploaded!!!!\n" + util.inspect({
                    fields: fields,
                    files: files
                }));
                //讀取 folder 內的 file
                // console.log(fs.readdirSync(folderPath));

                //讀取檔案長度
                // console.log(files.filetoupload.length);
                try {
                    //輸出 zip 檔   
                    if (files.filetoupload.length >= 2) { // 如果檔案數量>=2， 因為 files 參數在數量>=2時回傳的是一個 object array
                        console.log(files.filetoupload);
                        var zip = new JSZip();
                        writeProcessLog("\n" + util.inspect(files.filetoupload));
                        //取得每一個 file 的 path 並加入 zip 中   
                        files.filetoupload.forEach(element => {
                            if (element.size == 0 || element.name == "") {
                                console.log("This file will not be compressed to a ZIP file :" + element.path);
                            } else {
                                var imageAsBase64 = fs.readFileSync(element.path, 'base64'); // 將圖片讀取成 base64 編碼型式的 url
                                var pic_name = element.path.slice(element.path.lastIndexOf("/") + 1);
                                zip.file(pic_name, imageAsBase64, { // 新增檔案到 zip 裡
                                    base64: true
                                });
                            }
                            // console.log(element.path);
                        });
                        zip.generateAsync({
                            type: "nodebuffer",
                            compression: "DEFLATE"
                        }).then(function (content) {
                            fs.writeFile("./zipfolder/" + folderPath + ".zip", content, function (err) {
                                if (err) throw err;
                                console.log("export zip done !");
                                res.end(
                                    '<script>setInterval(function(){ window.location.replace( window.location.origin + "/uploadpage"); }, 3000); </script>'
                                );
                                sendEmail();
                            });
                        }).catch(function (err) {
                            writeErrorLog("\n" + err.stack);
                        });
                    } else { // 如果檔案數量是0個或1個的狀態

                        if (files.filetoupload.size == 0 || files.filetoupload.name == "") {
                            console.log("This file will not be compressed to a ZIP file :" + files.filetoupload.path);
                        } else {
                            var zip = new JSZip();
                            var imageAsBase64 = fs.readFileSync(files.filetoupload.path, 'base64'); // 將圖片讀取成 base64 編碼型式的 url
                            var pic_name = files.filetoupload.path.slice(files.filetoupload.path.lastIndexOf("/") + 1);
                            zip.file(pic_name, imageAsBase64, { // 新增檔案到 zip 裡
                                base64: true
                            });
                            zip.generateAsync({
                                type: "nodebuffer",
                                compression: "DEFLATE"
                            }).then(function (content) {
                                fs.writeFile("./zipfolder/" + folderPath + ".zip", content, function (err) {
                                    if (err) throw err;
                                    console.log("export zip done !");
                                    res.end(
                                        '<script>setInterval(function(){ window.location.replace( window.location.origin + "/uploadpage"); }, 3000); </script>'
                                    );
                                    sendEmail();
                                });
                            }).catch(function (err) {
                                writeErrorLog("\n" + err.stack);
                            });
                        }

                    }
                } catch (e) {
                    res.end("<script> alert('請至少上傳一個檔案');window.history.back();</script>");
                }

            }

            function writeProcessLog(data) {
                fs.appendFileSync("logfolder/" + folderPath + "/" + "process_log.txt", data, function (err) {
                    if (err) throw err;
                    console.log("appendFile : " + "logfolder/" + folderPath + "/" + "process_log.txt successfully.");
                });
            }

            function writeErrorLog(data) {
                fs.appendFileSync("logfolder/" + folderPath + "/" + "error_log.txt", data, function (err) {
                    if (err) throw err;
                });
            }

            function sendEmail() {
                //添加檔案至附件陣列等待信件發送
                // let attachments = [];
                // for (let index = 0; index < fs.readdirSync(folderPath).length; index++) {
                //     attachments.push({
                //         filename: fs.readdirSync(folderPath)[index],
                //         path: folderPath + "/" + fs.readdirSync(folderPath)[index],
                //         cid: index + "h410018@gmail.com"
                //     });
                // }
                // console.log(attachments);
                var transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: 'h410018@gmail.com',
                        pass: ''
                    }
                });
                // 設置郵件內容
                var message = {
                    from: "h410018@gmail.com",
                    to: "h410018@gmail.com", // chaowu1698@gmail.com
                    subject: ' 這是來自 ' + fields.driver_name + ' 先生/女士的現場事故照片',
                    text: "Plaintext version of the message",
                    html: '<html><body>' +
                        '<h1>這是來自 ' + fields.driver_name + ' 先生/女士的現場事故照片</h1>' +
                        '<h3>事故地址 : ' + fields.accident_address + '</h3>' +
                        '<h3>事故時間 : ' + fields.happened_date + '</h3>' +
                        '<h3>通知人姓名 : ' + fields.informer_name + '</h3>' +
                        '<h3>通知人電話 : ' + fields.informer_phonenumber + '</h3>' +
                        '<h3>駕駛人姓名 : ' + fields.driver_name + '</h3>' +
                        '<h3>駕駛人電話 : ' + fields.driver_phonenumber + '</h3>' +
                        '<h3>車牌號碼 : ' + fields.license_plate_number + '</h3>' +
                        '<h3>備註 :' + fields.note + '</h3>' +
                        '<h3>上傳者 remote ip : ' + ip + ":" + port + "</h3>"
                        // + 
                        // '<img style="width:250px;" src="cid:unique@cid">' +
                        // '<script src="" async defer></script>' +
                        // '</body></html>'
                        ,
                    attachments: {
                        filename: folderPath + ".zip",
                        path: "./zipfolder/" + folderPath + ".zip",
                        cid: "h410018@gmail.com"
                    }
                };
                // 信件發送
                transporter.sendMail(message, function (err, info) {
                    console.log("sending email ...")
                    if (err) {
                        console.log(err);
                        fs.appendFile("logfolder/" + folderPath + "/" + "error_log.txt", "\n" + err.stack, function (err) {
                            if (err) throw err;
                        });
                    } else {
                        // console.log('Email sent: ' + info.response);
                        writeProcessLog("\n" + util.inspect(info));
                        console.log("process done");
                    }
                });
            }
        });
    }
    // res.send('<script>'+
    // 'window.history.forward();'+
    // 'function noBack() { window.history.forward(); }'+
    // 'alert("test")'+
    // '</script>'+
    // '<body '+
    // 'onload="noBack();" onpageshow="if (event.persisted) noBack();" onunload="if (!window.__cfRLUnblockHandlers) return false; ">'
    // );
});

var server = app.listen(PORT, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Server on : %s:%s', host, port);
});