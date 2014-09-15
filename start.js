var minPort = process.argv[2],
maxPort = process.argv[3],
NRP = require("node-redis-pubsub-fork"),
pubsubChannel = new NRP({ scope: "messages" });

var discoveryUrl = "https://github.com/Micromuon/discovery.git",
    healthcheckUrl = "https://github.com/Micromuon/healthcheck.git",
    loggingUrl = "https://github.com/Micromuon/logging.git",
    alertingUrl = "https://github.com/Micromuon/alerting.git",
    wrapperUrl = "https://github.com/Micromuon/apiwrapper.git";

var discoveryInfo;

pubsubChannel.on("deployer:bootSuccess", function(data) {
    pubsubChannel.emit("deployer:deploy", { url: discoveryUrl });
    console.log("Discovery deploying");
});

pubsubChannel.on("deployer:deployResult", function(data) {
    if (data.failed) {
        console.log("ERROR: Could not deploy " + data.url);
    } else {
        // Start newly deployed service
        if (data.name == "Micromuon/logging" ||
            data.name == "Micromuon/discovery" ||
            data.name == "Micromuon/healthcheck" ||
            data.name == "Micromuon/alerting" ||
            data.name == "Micromuon/apiwrapper") {
            console.log("deployed: " + data.name);
            pubsubChannel.emit("deployer:start", {name: data.name});
        }

        // Deploy next service in sequence
        if (data.name == "Micromuon/discovery") {
            pubsubChannel.emit("deployer:deploy", { url: loggingUrl });
            console.log("Logging deploying");
        } else if (data.name == "Micromuon/logging") {
            pubsubChannel.emit("deployer:deploy", { url: healthcheckUrl });
            console.log("Healthcheck deploying");
        } else if (data.name == "Micromuon/healthcheck") {
            pubsubChannel.emit("deployer:deploy", { url: alertingUrl });
            console.log("Alerting deploying");
        } else if (data.name == "Micromuon/alerting") {
            pubsubChannel.emit("deployer:deploy", { url: wrapperUrl });
            console.log("WrapperAPI deploying");
        }
    }
});

pubsubChannel.on("deployer:startResult", function(data) {
    if (data.failed) {
        console.log("ERROR: Could not start " + data.name);
    } else {
        if (data.name == "Micromuon/discovery") {
            // Save this data so we can kill discovery itself later on when exiting
            discoveryInfo = data;
        }
        console.log("started: " + data.name);
    }
});


var exiting = false;
function exit() {
    if (!exiting) {
        exiting = true;
        console.log("Gracefully exiting:");

        pubsubChannel.emit("deployer:stop", { name: "Micromuon/apiwrapper" });
        pubsubChannel.on("deployer:stopped", function(data) {
            if (data.name == "Micromuon/apiwrapper") {
                console.log("- WrapperAPI stopped");
                pubsubChannel.emit("deployer:stop", { name: "Micromuon/alerting" });
            } else if (data.name == "Micromuon/alerting") {
                console.log("- Alerting stopped");
                pubsubChannel.emit("deployer:stop", { name: "Micromuon/logging" });
            } else if (data.name == "Micromuon/logging") {
                console.log("- Logging stopped");
                pubsubChannel.emit("deployer:stop", { name: "Micromuon/healthcheck" });
            } else if (data.name == "Micromuon/healthcheck") {
                console.log("- Healthcheck stopped");
                pubsubChannel.emit("deployer:stop", discoveryInfo);
            } else if (data.name == "Micromuon/discovery") {
                console.log("- Discovery stopped");
                console.log("All services stopped. Exiting now...");
                process.exit();
            }
        });
    }
}
process.on("SIGTERM", exit); // Kill process
process.on("SIGINT", exit); // Ctrl+C

exports.exit = exit;

require("./deployer.js");
