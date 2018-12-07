import { me } from "companion"
import { getMokeData } from "./MokeData.js";
import { peerSocket } from "messaging";
import { geolocation } from "geolocation";

var MAX_ROUTES_PER_MESSAGE = 15;
var MAX_MESSAGES = 3;
var isTestApp = false;//true;
var currentLocation = undefined;
var lastFetchedData = {
  lastRefresh : new Date(),
  data : undefined  
};

var refreshHandler = undefined;

// Helper
const MILLISECONDS_PER_MINUTE = 1000 * 60

console.log("Companion lunched");

// Wake the Companion after 30 minutes
//me.wakeInterval = 30 * MILLISECONDS_PER_MINUTE
//me.monitorSignificantLocationChanges = true;

//// Handle here a change in the location (every 5km or so).
//me.onsignificantlocationchange = () => {
//  console.log("Significant location change! => event")
//  var pos = me.launchReasons.locationChanged.position
//  console.log("Latitude: " + pos.coords.latitude,
//              "Longitude: " + pos.coords.longitude);
//  currentLocation = {lat : pos.coords.latitude, lon: pos.coords.longitude};
//  refreshData();
//};

//// Handle here relunching of the app periodicly
//me.onwakeinterval = () => {
//  
//};


peerSocket.onopen = () =>{
  console.log("Peer is open on Companion.");
}

peerSocket.onmessage = (msg) => {
  console.log("Got refresh from client.");
  
  if (refreshHandler){
    clearTimeout(refreshHandler);
    refreshHandler = undefined;
  }
  
  refreshData();
}; 


function getTransitInfo(lat,lon, onDone){
  
    if (isTestApp){
      setTimeout(function(){
        console.log("Got Moke Data");
        onDone(getMokeData());
      }, 1000);
    }
    else {
      console.log("fetching data");
      fetch("https://efobus.herokuapp.com/bus-for-location?lat=" + lat + "&long=" + lon + "&lang=eng&time="+Date.now(), {method: "GET"}).then(function(response){
        console.log("response: " + response.statusText);
        
        if (response.status !== 200){
          console.log("surr")
          return {then:function(func){ func({routeLines:[]}); console.log("next step in getTransitInfo is surrpressed.");}};
        }
        
        return response.json();
      }).then(function(data){
        
        console.log("Got Data: "+ data);
        onDone(data);
      });  
    }
}

function refreshData(){

  refreshHandler = undefined;
    
  if (!currentLocation){
    refreshHandler = setTimeout(refreshData, 50);
    return;
  }
  
  console.log("Updating data in companion");
  getTransitInfo(currentLocation.lat, currentLocation.lon,function(data){
        
    console.log("Data arrived to companion");
    lastFetchedData = {
      lastRefresh : new Date(),
      data : data  
    };
    
    console.log("start refresh seconds: " + secondsDate());
    var now = new Date();
    var newData = {now: now ,r:[]};
    
    data.routeLines = data.routeLines.sort(function(a,b){
      let ad = new Date(a.nextBusTime) ;
      let bd = new Date(b.nextBusTime) ;
      
      return ad -bd;
    });
    
    var filterHelper = {};
    var passedBusses = "";
    var inStationBusses = "";
    var upCommingBusses = "";
    var tempFilter = {
      inStation:{},
      upComming : {},
      passed: {}
    };
    for (var i =0; i < data.routeLines.length; i++){
      let r = data.routeLines[i];
      
      // get next time in minutes
      let nextTime = Math.round(((new Date(r.nextBusTime) - now) / 1000) / 60);
      
      if (filterHelper[r.busNumber +";;"+ r.endPoint.locationName]){
        continue;
      }
      
      filterHelper[r.busNumber +";;"+ r.endPoint.locationName] = true;
      
      if (nextTime < 0){
        if (!tempFilter.passed[r.busNumber]){
          tempFilter.passed[r.busNumber.toString()] = true;
          passedBusses = passedBusses + (passedBusses? ", " : "") + r.busNumber.replace("א", "a").replace("ב", "b");
        }
        continue;
      }
      else if (nextTime == 0){
        if (!tempFilter.inStation[r.busNumber]){
          tempFilter.inStation[r.busNumber.toString()] = true;
          inStationBusses = inStationBusses + (inStationBusses? ", " : "") + r.busNumber.replace("א", "a").replace("ב", "b");
        }
      } 
      else if (nextTime < 5){
        if (!tempFilter.upComming[r.busNumber]){
          tempFilter.upComming[r.busNumber] = true;
          upCommingBusses = upCommingBusses + (upCommingBusses? ", " : "") + r.busNumber.replace("א", "a").replace("ב", "b");
        }
      }
      
      newData.r.push({n:r.busNumber.replace("א", "a").replace("ב", "b"), t: nextTime, d: r.endPoint.locationName.substr(0,40)});
    }
    
    // the gt field is for group type. where:
    // undefined => No group
    // 1 => grouped by Next 5
    // 2 => grouped by In Station
    // 3 => grouped by Passed the station
    if (upCommingBusses){
      newData.r.unshift({n:upCommingBusses, t: -1, gt:1, d: "Next 5 minutes"});
    }
    if (inStationBusses){
      newData.r.unshift({n:inStationBusses, t: -1, gt:2, d: "In Station"});
    }
    if (passedBusses){
      newData.r.unshift({n:passedBusses, t: -2, gt:3, d: "Passed Busses"});
    }
    
    if (peerSocket.readyState === peerSocket.OPEN){
      var msgCount = Math.min(Math.ceil(newData.r.length / MAX_ROUTES_PER_MESSAGE), MAX_MESSAGES);
      for(var i=0; i < msgCount; i++){
        let msgType = 0;

        if (i > 0 && i < msgCount - 1){
          msgType = 1;
        }
        else if (i == msgCount - 1){
          if (i == 0){
            msgType = 3;
          }
          else{
            msgType = 2;
          }
        }

        let msg = { t: msgType, d: {rt: now ,r:newData.r.splice(i * MAX_ROUTES_PER_MESSAGE, MAX_ROUTES_PER_MESSAGE)}};
        msg = JSON.stringify(msg);
        console.log("Generated message length: " + msg.length + " msg " + (i + 1) + " of " + msgCount);
        console.log("Max message allowed:  " + peerSocket.MAX_MESSAGE_SIZE);

        peerSocket.send(msg);
      }
      
      if (msgCount == 0){
        peerSocket.send(JSON.stringify({t:3, d:{rt:now,r:[]}}));
      }
    }
  });
  
  if (refreshHandler){
    clearTimeout(refreshHandler);
    refreshHandler = undefined;
  }
  
  // keep refreshing as long as we didnt passed more than 10 
  // minutes since last time we opened the app in the watch.
  refreshHandler = setTimeout(refreshData, 30 * 1000);
}


function findLocation(){
  geolocation.getCurrentPosition(function(position){
    currentLocation = {lat : position.coords.latitude, lon: position.coords.longitude};
  }, function(error){
     console.log("Error: " + error.code,
                 "Message: " + error.message);
  });

  setTimeout(findLocation, 30 * 1000);
}

function secondsDate(){
  var x = new Date();
  return x.getHours() * 60 + x.getMinutes() * 60 + x.getSeconds();
}

findLocation();
refreshData();

