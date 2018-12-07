import { peerSocket } from "messaging";
import document from "document";
import * as fs from "fs";
import { me } from "appbit";
import extraInfo from "./extraInfoPage.js";

// When data is stale for more than 2 minutes, it will show a stale icon.
var ALLOWED_DATA_VERSION = 1;
var MAX_STALE_DATA_SECONDS = 2 * 60;
var localData = {
  version:1,
  lastRefresh : new Date(),
  data : undefined  
};
var currentMsgData = undefined;

peerSocket.onopen = () =>{
  
  console.log("Peer is open.");
  
  console.log("Request cache refresh from Companion");
  requestDataRefresh();
}

if (me.appTimeoutEnabled) {
 console.log("Timeout is enabled");
}
console.log("Disabling timeout");
me.appTimeoutEnabled = false;

peerSocket.onmessage = (msg) => {

  console.log("Got data in app");
  
  //var msgNum = parseInt(msg.data[0]);
  var newData = JSON.parse(msg.data);
  console.log("type: " + newData.t);
  
  if (newData.t == 0 || newData.t == 3 || !currentMsgData){
    currentMsgData = newData.d;
  }
  else{
    currentMsgData.r.push.apply(currentMsgData.r, newData.d.r);
  }
  
  if (newData.t >= 2){
    console.log("end refresh seconds: " + secondsDate());
    var data = currentMsgData;
    currentMsgData = undefined;
    
    if (!data){
      data = {t:3, d:{rt:now,r:[]}};
    }
    
    onDataUpdate(data);
  }
};

function secondsDate(){
  var x = new Date();
  return x.getHours() * 60 + x.getMinutes() * 60 + x.getSeconds();
}

function requestDataRefresh(){
  
  // Show refreshing icon.
  UpdateDataIsRefreshing(true);
  
  if (peerSocket.readyState !== peerSocket.OPEN){
    
    console.log("peerSocket Not Ready: " + peerSocket.readyState);
    console.log("retraying in 100ms");
    setTimeout(requestDataRefresh, 100);
    return;
  }
  
  console.log("Sending refresh command");
  peerSocket.send("refresh");
}

function UpdateDataIsRefreshing(isLoading){
  let spinner = document.getElementById("loading");
  
  spinner.state = isLoading? "enabled" : "disabled";
  console.log("Setting state to " + spinner.state);
  //spinner.state = "enabled";
}

function getData(){
  console.log("Getting cache data.");
  return localData;
}

function buildUI(data){
  let VTList = document.getElementById("routeLines");
  console.log("building ui");
  
  VTList.delegate = {
    getTileInfo: function(index) {
      //console.log(`returning index ${index}, route: ${data.r[index].n}`);
      //return data.r[index];
      if (index < data.r.length){
        return {
          type: "my-pool",
          value: data.r[index],
          index: index
        };
      }
      else{
        return undefined;
      }
    },
    configureTile: function(tile, info) {
        let value = info.value;//data.r[info.index];
        //console.log(`configuration tile ${value.n}`);
      let txt = tile.getElementById("text");
      let to = tile.getElementById("to");
      
      if (value.gt){
        if (value.gt == extraInfo.groupTypes.Next5Minutes){
          txt.text = `${value.n} in ${value.t} m`;
          to.style.fill = "cyan";
        }
        else if (value.gt == extraInfo.groupTypes.InStation){
          txt.text = `${value.n} In Station`;
          to.style.fill = "green";
        }
        else if (value.gt == extraInfo.groupTypes.PassedStation){
          txt.text = `${value.n}`;
          to.style.fill = "red";
        }
      }
      else{
        txt.text = `${value.n} in ${value.t} m`;
        to.style.fill = "white";
      }
      
      to.text = value.d;
      
        let touch = tile.getElementById("touch-me");
        touch.onclick = evt => {
          console.log(`touched: ${value.n}: ${value.t}`);
        };
      
    }
  }; 
 
 VTList.length = data.r.length;
 // if (VTList.length != 100){
 //   VTList.length = 100;//data.r.length;
 // }
 // else{
 //     for(var i =0; i < data.r.length; i++){
 //       VTList.updateTile(i, true);
 //     }
 // }
}

function updateUI(){
  console.log("Updaging UI");
  let data = getData();
  let info = data? data.data : undefined;
  
  if (isDataRefreshed()){
   // Show Data is stale icon. 
  }  
  
  UpdateDataIsRefreshing(false);
  
  if (info){
    buildUI(info);
  }
  else{
    // Show loading for the first time.
    UpdateDataIsRefreshing(true);
  }
}

function isDataRefreshed(){
  var secondsSinceLastRefresh = (new Date() - getData().lastRefresh) / 1000;
  return secondsSinceLastRefresh < MAX_STALE_DATA_SECONDS;
}

function onDataUpdate(content){
  
  console.log("Update cache");
  localData = {
    version:1,
    lastRefresh : new Date(),
    data : content  
  };
  
  fs.writeFileSync("localData.cache.json", localData, "json")
  
  console.log("Update UI");
  updateUI();
}

// Application loading -> Should improve the loading time of the app.
setTimeout(function(){
  try{
    console.log("Loading data from local cache for the first time.")
    // Loading data from local cache for the first time.
    var cacheData = fs.readFileSync("localData.cache.json", "json")

    if (cacheData && cacheData.version >= ALLOWED_DATA_VERSION){
      localData = cacheData;
    }
  }
  catch{
    console.log("Failed to load data from cache.")
  }
    
  updateUI();

  console.log("Setting up refresh call.");
  // Setting data to be refreshed automaticly every 30 seconds.
  setInterval(requestDataRefresh, 60 * 1000);
}, 1);

console.log("App code started");
// Show basic first UI to make the app fill responsive.
