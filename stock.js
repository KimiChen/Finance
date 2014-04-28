#!/usr/bin/env node

// npm install request;npm install node-prowl;
var fs = require('fs');
var request = require('request');
var Prowl = require('node-prowl');
var list = require("./list.js");

// 发送限制, 同一个code，5分钟内只发一次
var limitTime = 5 * 60 * 1000;
var curViewTime = '';

if (inTradeTime()) {

	console.log("Starting monitoring...... Now:" + curViewTime);

	// 开始循环监视
	for(var i in list) {
		getStockInfo(list[i], checkChange);
	}

} else {
	console.log("Not in trade time...... Now:" + curViewTime);
};


// 交易时间
function inTradeTime() {
	// debug
	//return true;

	// 周一到周五, 9:25-11:30  13:00-15:00
	var amStart = 925;
	var amEnd = 1130;
	var pmStart = 1300;
	var pmEnd = 1500;

	var d = new Date();
	var weekday = d.getDay();
	var hour = d.getHours();
	var min = d.getMinutes();
	var sec = d.getSeconds();
	// min 需要左边补0，保证如 7 变成 07
	min = addZero(min, 2);

	// 显示时间
	curViewTime = hour + ":" + min +":" + sec;

	var curTime = Number(hour + "" + min);

	if (weekday == 6 || weekday == 0) {
		return false;
	};

	if ((curTime > amStart && curTime < amEnd) || (curTime > pmStart && curTime < pmEnd)) {
		return true;
	}

	return false;
}


// 左边补0
function addZero(str, length){
	str = String(str);
	return new Array(length - str.length + 1).join("0") + str;
}


// 当前时间戳
function getCurTimestamp() {
	return new Date().getTime();
}


// 检查是否发过
function haveSendCheck(code) {
	// debug
	//return false;

	var lastSendFile = "send.lock";
	var timestamp = getCurTimestamp();

	var lastSendList = fs.readFileSync(lastSendFile, "utf8");

	var lastSendLog = {};
	if (lastSendList) {
		// 判断时间是否超过了 设定时间
		lastSendLog = JSON.parse(lastSendList);
		// 还在限制的范围内，不发
		if (timestamp - lastSendLog[code] < limitTime ) {
			return true;
		}
	};

	lastSendLog[code] = timestamp;

	// 写到文件
	fs.writeFileSync(lastSendFile, JSON.stringify(lastSendLog), "utf8");

	// 需要发送
	return false;
}


// 发送消息
function sendNotice(title, message) {

	var prowl = new Prowl('3648f147a353e293b3934ab39d4aa72d4d15a50d');

	prowl.push(title + "\n" + message, 'Stock Monitor', function(err, message){
	    if( err ) {
	    	console.log(err);	
	    } 
	});
}


// 检查改变
function checkChange (stock, rspStock) {

	var rate = Math.round(rspStock.upDownRate*10000)/100;
	var notice = "  current price:" + rspStock.curPrice + " rate: " + rate + "%";

	if (rspStock.curPrice == '0.00') {
		console.log(stock.code + ' was Suspended');
		return false;
	};


	var needNotice = false;
	// 配置了最大提醒价格
	if (stock.gtPrice && rspStock.curPrice >= stock.gtPrice) {
		needNotice = "by gtPrice(" + stock.gtPrice + ")";
	};

	// 现价格配置的最低价格
	if (stock.ltPrice && rspStock.curPrice <= stock.ltPrice) {
		needNotice = "by ltPrice(" + stock.ltPrice + ")";
	};


	if (rspStock.upDownRate > 0) {

		// 上涨
		if (stock.gtUpRate && rspStock.upDownRate >= stock.gtUpRate/100) {
			needNotice = "by gtUpRate(" + stock.gtUpRate + ")";
		};

		if (stock.ltUpRate && rspStock.upDownRate <= stock.ltUpRate/100) {
			needNotice = "by ltUpRate(" + stock.ltUpRate + ")";
		};

	} else {
		// 下跌
		var absRate = Math.abs(rspStock.upDownRate);

		if (stock.gtDownRate && absRate >= stock.gtDownRate/100) {
			needNotice = "by gtDownRate(" + stock.gtDownRate + ")";
		};

		if (stock.ltDownRate && absRate <= stock.ltDownRate/100) {
			needNotice = "by ltDownRate(" + stock.ltDownRate + ")";
		};
	};

	// 通知
	if (needNotice) {
		var haveSended = haveSendCheck(stock.code);
		!haveSended && sendNotice(stock.name + '(' + stock.code + ') ' + needNotice, notice);

		console.log(needNotice + notice);
	} else {
		console.log('Nothing for ' + stock.code);
	};
}


// 获取详细信息
function getStockInfo (stock, checkChange) {

	// 请求参数
	request.get(
		{
			url: "http://hq.sinajs.cn/list=" + stock.code,
			encoding: "utf8"
		},
		function(error, response, body) {
			if(!error && response.statusCode == 200){
				// 运行变量
				eval(body);
				var infoString = eval('hq_str_' + stock.code);

				var info = infoString.split(",");

				var rspStock = {};
				rspStock.curPrice = info[3];
				rspStock.yesterdayPrice = info[2];

				rspStock.upDownRate = (rspStock.curPrice - rspStock.yesterdayPrice)/rspStock.yesterdayPrice;

				checkChange(stock, rspStock);
			} else {
				// 错误信息
				console.log(error);
			}
		}
	);
}

