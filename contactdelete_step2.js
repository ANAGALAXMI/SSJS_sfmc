<script runat="server">
Platform.Load("core","1");
Write("SSJS is running");
// ===================== CONFIG =====================
var CLIENT_ID     = "qz9u19mo6iqy2cxvxl7azibg";
var CLIENT_SECRET = "soYdA0xhBHRWzLuSvO5yqkgQ";
var MID           = "100015113";
var SUBDOMAIN     = "mck6j5pxy0jtm0fqjg971x-hzmj8";
 
// ===================== TOKEN =====================
var authURL = "https://" + SUBDOMAIN + ".auth.marketingcloudapis.com/v2/token";
var payload = {
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    account_id: MID
};
var authResponse = HTTP.Post(
    authURL,
    "application/json",
    Platform.Function.Stringify(payload)
);
 
// Debug
//Write("Auth Status: " + authResponse.StatusCode + "<br>");
//Write("Auth Response: " + authResponse.Response + "<br>");
var authObj = Platform.Function.ParseJSON(authResponse.Response[0]);
 
if (!authObj || !authObj.access_token) {
    throw "Auth failed: " + authResponse.Response;
}
 
var ACCESS_TOKEN = authObj.access_token;
var SourceDE = "ListOfDeletionApprovedContacts_AllBUs";
var logDE = DataExtension.Init("LoggerDE_ContactDeletion");
var logger = "LoggerDE_ContactDeletion";
var rows = Platform.Function.LookupRows(
    SourceDE,
    ["ToDelete"],
    ["True"]
);

var falseRows = Platform.Function.LookupRows(SourceDE, ["ToDelete"], [false]);

if ((!rows || rows.length == 0) && 
    (!falseRows || falseRows.length == 0)){
    logDE.Rows.Add({
        ContactKey: "NULL",
        EmailAddress: "NULL",
        Status: "Source DE is empty. Automation Stopped.",
        TimeStamp: Now(),
        BU: "NULL"
    });
    throw "Custom Error: Source DE is empty. No rows to process!";
}

 
if (rows && rows.length > 0) {
    for (var i = 0; i < rows.length; i++) {
 
        var sk = rows[i].ContactKey;
        var bu = rows[i].BU;
        var email = rows[i].EmailAddress;
        if (!sk) {
            continue;
        }
        var checkURL = "https://" + SUBDOMAIN + ".rest.marketingcloudapis.com/contacts/v1/contacts/search";
        var searchPayload = {
            request: {
                attributes: [
                    { key: "Contact.Contact Key" }
                ]
            },
            conditionSet: {
                operator: "And",
                conditions: [{
                    attribute: { key: "Contact.Contact Key" },
                    operator: "Equals",
                    value: { items: [ sk ] }
                }]
            }
        };
        var checkResp = HTTP.Post(checkURL, "application/json", Platform.Function.Stringify(searchPayload), ["Authorization"], ["Bearer " + ACCESS_TOKEN]);
        var exists = false;

        if (checkResp.StatusCode == 200 && checkResp.Response && checkResp.Response.length > 0) {
          var checkObj = Platform.Function.ParseJSON(checkResp.Response[0]);
          exists = (checkObj && checkObj.count > 0);
        }
        if (!exists) {
          // ====== NOT EXISTS CASE ======
          Platform.Function.UpsertData(
            logger,
            ["ContactKey"], [sk],
            ["Status", "TimeStamp", "BU", "EmailAddress"], ["Contact does not exist", Now(), bu, email]
          );
        
          Platform.Function.UpdateData(
            SourceDE,
            ["ContactKey"], [sk],
            ["ToDelete"], ["False"]
          );
 
             continue; // skip deletion API
        }
 
        try {
            var payload = {
                values: [ sk ],
                deleteOperationType: "ContactAndAttributes"
            };
 
            var del = HTTP.Post(
                "https://" + SUBDOMAIN + ".rest.marketingcloudapis.com/contacts/v1/contacts/actions/delete?type=keys",
                "application/json",
                Platform.Function.Stringify(payload),
                ["Authorization"],
                ["Bearer " + ACCESS_TOKEN]
            );
 
            // Parse response
            if (del.Response && del.Response.length > 0) {
               var delObj = Platform.Function.ParseJSON(del.Response[0]);
            }
            if (del.StatusCode == 200 || del.StatusCode == 202) {
                Platform.Function.UpdateData(
                    SourceDE,
                    ["ContactKey"],
                    [sk],
                    ["ToDelete"],
                    ["False"]
                );
            }
            Platform.Function.UpsertData(
                logger,
                ["ContactKey"], [sk],
                ["Status", "TimeStamp", "BU", "EmailAddress"], [del.StatusCode, Now(), bu, email]
            );
        } catch (e) {
            Platform.Function.UpsertData(
            logger,
            ["ContactKey"], [sk],
            ["Status", "TimeStamp", "BU", "EmailAddress"], ["Contact does not exist", Now(), bu, email]
          );
        }
    }
}
</script>