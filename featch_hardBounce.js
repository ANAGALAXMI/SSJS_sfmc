<script runat="server">
Platform.Load("core","1");

var api = new Script.Util.WSProxy();

try {

    var bounceCols = [
        "BounceCategory","BounceType","SubscriberKey","Client.ID",
        "CreatedDate","EventType","EventDate","ModifiedDate",
        "ObjectID","SendID","SMTPCode","SMTPReason",
        "TriggeredSendDefinitionObjectID"
    ];
    var startDate = "2023-01-01";
    var endDate   = "2024-01-01";
    var bounceFilter = {
        LeftOperand: {
            Property: "EventType",
            SimpleOperator: "equals",
            Value: "HardBounce"
        },
        LogicalOperator: "AND",
        RightOperand: {
            LeftOperand: {
                Property: "EventDate",
                SimpleOperator: "greaterThanOrEqual",
                Value: startDate
            },
            LogicalOperator: "AND",
            RightOperand: {
                Property: "EventDate",
                SimpleOperator: "lessThan",
                Value: endDate
            }
        }
    };

    /*
    var bounceFilter = {
        Property: "EventType",
        SimpleOperator: "equals",
        Value: "HardBounce"
    }; */

    var moreData = true;
    var reqID = null;

    var maxBatches = 9;  
    var batchCounter = 0;

    while (moreData && batchCounter < maxBatches) {

        var bounceResult = reqID
            ? api.getNextBatch("BounceEvent", reqID)
            : api.retrieve("BounceEvent", bounceCols, bounceFilter);

        if (!bounceResult || !bounceResult.Results || bounceResult.Results.length === 0) {
            break;
        }

        batchCounter++;

        /* ----------------------------------------
           STEP 1: Collect SubscriberKeys
        -----------------------------------------*/
        var bounceMap = {};
        var subKeys = [];

        for (var i = 0; i < bounceResult.Results.length; i++) {
            var b = bounceResult.Results[i];
            if (b.SubscriberKey) {
                bounceMap[b.SubscriberKey] = b;
                subKeys.push(b.SubscriberKey);
            }
        }

        /* ----------------------------------------
           STEP 2: Retrieve Subscribers in BULK
        -----------------------------------------*/
        var subscribers = {};
        var chunkSize = 200;

        for (var c = 0; c < subKeys.length; c += chunkSize) {

            var chunk = subKeys.slice(c, c + chunkSize);
            var subFilter = {
                Property: "SubscriberKey",
                SimpleOperator: "IN",
                Value: chunk
            };

            var subResult = api.retrieve(
                "Subscriber",
                ["SubscriberKey","EmailAddress","Status"],
                subFilter
            );

            if (subResult && subResult.Results) {
                for (var j = 0; j < subResult.Results.length; j++) {
                    var s = subResult.Results[j];
                    subscribers[s.SubscriberKey] = s;
                }
            }
        }

        /* ----------------------------------------
           STEP 3: UPSERT DATA
        -----------------------------------------*/
        for (var key in subscribers) {

            var subscriber = subscribers[key];
            var bounce = bounceMap[key];
            if (!bounce) continue;

            Platform.Function.UpsertData(
                "ENT.TEST_INTLB2B_HardBounce_RawContacts_Copy",
                ["SubscriberKey"],
                [key],
                [
                    "EmailAddress","LastHardBounceDate","BounceReason",
                    "BounceCategory","SourceBU","BounceType","CreatedDate",
                    "EventType","EventDate","ModifiedDate","ObjectID",
                    "SendID","SMTPCode","TriggeredSendDefinitionObjectID"
                ],
                [
                    subscriber.EmailAddress || "",
                    bounce.EventDate || Now(),
                    bounce.SMTPReason || "",
                    bounce.BounceCategory || "",
                    bounce.Client.ID == 100017850 ? "INTL B2B" : "",
                    bounce.BounceType || "",
                    bounce.CreatedDate || "",
                    bounce.EventType || "",
                    bounce.EventDate || "",
                    bounce.ModifiedDate || "",
                    bounce.ObjectID || "",
                    bounce.SendID || "",
                    bounce.SMTPCode || "",
                    bounce.TriggeredSendDefinitionObjectID || ""
                ]
            );
        }

        moreData = bounceResult.HasMoreRows;
        reqID = bounceResult.RequestID;
    }

} catch (e) {
    Write("Error: " + String(e));
}
</script>