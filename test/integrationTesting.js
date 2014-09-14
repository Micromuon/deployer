var assert = require("assert"),
    NRP = require("node-redis-pubsub-fork"),
    request = require("superagent"),
    setTimeout = require("timers").setTimeout,
    pubsubChannel = new NRP({ scope: "messages" }),
    mongojs = require("mongojs"),
    db = mongojs.connect("logDB", ["discovery"]);

var repoUrl = "gitlab@git.bskyb.com:sea-microservices/microservices-testservice.git";
var serviceName = "sea-microservices/microservices-testservice";
var port;
var start;

before(function(done) {
    this.timeout(30000);
    start = require("../start.js");
    pubsubChannel.on("deployer:started", function(data) {
        if (data.name == "sea-microservices/microservices-logging") {
            setTimeout(function() {
                done();
            }, 1000);
        }
    });
});

describe("integration testing :", function() {
    
    it("starts deployer and core microservices using start up script", function(done) {
        this.timeout(20000);
        pubsubChannel.on("deployer:started", function(data) {
            if (data.name == "sea-microservices/microservices-wrapperapi") {
                done();
            }
        });
    });
    
    it("deploys service by URL and saves service to discovery", function(done) {
        this.timeout(20000);
        pubsubChannel.emit("deployer:deploy", { url: repoUrl });
        pubsubChannel.on("discovery:saved", function(data) {
            if (data.name == serviceName) {              
                done(); 
            }
        });
    });
    
    it("starts a deployed service after startup", function(done) {
        this.timeout(20000);
        pubsubChannel.emit("deployer:start", { name: serviceName });
        pubsubChannel.on("deployer:started", function(data) {
            if (data.name == serviceName) {
                port = data.port;
                done(); 
            }
        });
    });
    
    it("healthcheck failures trigger email alerts", function(done) {
        this.timeout(30000);
        pubsubChannel.emit("healthcheck:submit", {name: serviceName, localURL: "http://localhost:" + port, frequency: "*/1 * * * * *", expectedResBody: "We are the knights who say ecckyecckyecckyfwootangwhoopah", expectedResStatus: 200});
        pubsubChannel.emit("alerting:saveInfo", {name: serviceName, emails: "sea.microservices@gmail.com", frequency: 1});
        pubsubChannel.on("alerting:sent", function(data) {
            done();
        });
    });
    
    it("successfully logs information", function(done) {
        this.timeout(10000);
        db.discovery.find({"channel": "saved", "name": serviceName}).toArray(function(err, result) {
            if (!err && result) {
                assert.notEqual(result[0].timeStamp, null);
                assert.equal(result[0].channel, "saved");
                assert.equal(result[0].name, serviceName);
                done();
            }
        });
    });
    
});

after(function(done) {
    this.timeout(25000);
    pubsubChannel.emit("deployer:stop", { name: serviceName });
    start.exit();
    setTimeout(function() {
        setTimeout(function() {
            done();
        }, 5000);
    }, 15000);
});
