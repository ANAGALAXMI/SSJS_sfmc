# Project 1: E-Commerce Welcome + Abandoned Cart Program
### Complete End-to-End Build Document (SFMC)

**Stack covered:** Data Extensions · CloudPages (AMPscript + SSJS) · Automation Studio
(Import, SQL Query, Script activities) · Journey Builder (2 journeys) · Email Studio
(dynamic AMPscript emails)

**Timeframe:** 4 days (Day 1–4 of your 1-week plan)

---

## 1. Architecture Overview

```
[CloudPage: Signup Form] ---> InsertDE ---> [Subscribers DE]
                                                   |
[CSV Upload] ---> [Automation: Import Activity] ---> [CartActivity DE] / [Products DE]
                          |
                  [SQL Query Activity] ---> [AbandonedCart_Filtered DE]
                  [SQL Query Activity] ---> [NewSignups_Last24Hrs DE]
                          |
        ---------------------------------------
        |                                      |
[Journey A: Welcome Series]          [Journey B: Abandoned Cart]
   Entry: NewSignups_Last24Hrs           Entry: AbandonedCart_Filtered
   Email 1 -> Wait -> Email 2 ->         Decision Split (Purchased?) ->
   Split (opened?) -> Email 3            Reminder Email -> Wait -> Discount Email
        |                                      |
   [Email Studio: dynamic AMPscript emails, product loops, personalization]
        |
[CloudPage: Subscription Center] <-- linked from email footer, updates Subscribers.Status
```

---

## 2. Data Extensions (build these first)

Create all four in **Email Studio → Subscribers → Data Extensions → Create**.

### 2.1 `Subscribers`
| Field | Type | Length | Primary Key | Nullable | Default |
|---|---|---|---|---|---|
| SubscriberKey | Text | 100 | ✅ | No | — |
| Email | EmailAddress | — | | No | — |
| FirstName | Text | 50 | | Yes | — |
| SignupDate | Date | — | | Yes | — |
| CategoryPref | Text | 50 | | Yes | — |
| Status | Text | 20 | | Yes | Active |

### 2.2 `Products`
| Field | Type | Length | Primary Key |
|---|---|---|---|
| ProductID | Text | 20 | ✅ |
| ProductName | Text | 100 | |
| Price | Decimal | — | |
| ImageURL | Text | 255 | |
| Category | Text | 50 | |

### 2.3 `CartActivity`
| Field | Type | Length | Primary Key |
|---|---|---|---|
| SubscriberKey | Text | 100 | ✅ |
| ProductID | Text | 20 | ✅ |
| DateAdded | Date | — | |
| Purchased | Text | 1 | | *("Y"/"N")* |

### 2.4 `PurchaseHistory`
| Field | Type | Length | Primary Key |
|---|---|---|---|
| SubscriberKey | Text | 100 | |
| OrderID | Text | 30 | ✅ |
| ProductID | Text | 20 | |
| OrderDate | Date | — | |
| Amount | Decimal | — | |

### 2.5 Derived DEs (created automatically by SQL Query Activities in Day 2 — no need to build manually, just note the names)
- `NewSignups_Last24Hrs`
- `AbandonedCart_Filtered`

Load `Products` with ~20–30 sample rows and `CartActivity` with ~30–50 sample rows (mix of `Purchased = "Y"` and `"N"`, with `DateAdded` values older than 24 hours for some rows) — you'll need this variety to see the segmentation logic actually filter something.

---

## 3. Day 1 — CloudPages: Signup Form

Build in **Web Studio → CloudPages → Create Landing Page** (blank template, HTML block).

### 3.1 AMPscript version

```html
%%[
VAR @firstName, @email, @category, @subKey, @errorMsg, @submitted

SET @submitted = RequestParameter("submitted")

IF @submitted == "true" THEN
  SET @firstName = RequestParameter("firstName")
  SET @email = RequestParameter("email")
  SET @category = RequestParameter("category")

  IF NOT EMPTY(@email) THEN
    SET @subKey = @email

    InsertDE(
      "Subscribers",
      "SubscriberKey", @subKey,
      "Email", @email,
      "FirstName", @firstName,
      "SignupDate", Now(),
      "CategoryPref", @category,
      "Status", "Active"
    )
  ELSE
    SET @errorMsg = "Please enter a valid email."
  ENDIF
ENDIF
]%%

%%[ IF @submitted == "true" AND EMPTY(@errorMsg) THEN ]%%
  <h2>Thanks, %%=v(@firstName)=%%! You're signed up.</h2>
  <p>We'll send updates about %%=v(@category)=%% products your way.</p>
%%[ ELSE ]%%
  <h2>Sign up for updates</h2>
  %%[ IF NOT EMPTY(@errorMsg) THEN ]%%
    <p style="color:red;">%%=v(@errorMsg)=%%</p>
  %%[ ENDIF ]%%
  <form method="post" action="%%=RequestParameter('PAGEURL')=%%">
    <input type="hidden" name="submitted" value="true" />
    <label>First Name</label>
    <input type="text" name="firstName" required /><br/>
    <label>Email</label>
    <input type="email" name="email" required /><br/>
    <label>Category Preference</label>
    <select name="category">
      <option value="Electronics">Electronics</option>
      <option value="Apparel">Apparel</option>
      <option value="Home">Home</option>
    </select><br/>
    <button type="submit">Sign Up</button>
  </form>
%%[ ENDIF ]%%
```

### 3.2 SSJS version (build as a second CloudPage to show both skillsets)

```html
<script runat="server">
Platform.Load("core", "1.1.1");
var submitted = Request.GetQueryStringParameter("submitted");
if (submitted == "true") {
  var email = Request.GetQueryStringParameter("email");
  var firstName = Request.GetQueryStringParameter("firstName");
  var category = Request.GetQueryStringParameter("category");

  if (email != null && email != "") {
    var de = DataExtension.Init("Subscribers");
    de.Rows.Add({
      SubscriberKey: email,
      Email: email,
      FirstName: firstName,
      SignupDate: Now(),
      CategoryPref: category,
      Status: "Active"
    });
    Write("<h2>Thanks, " + firstName + "!</h2>");
  } else {
    Write("<p style='color:red;'>Please enter a valid email.</p>");
  }
} else {
  Write('<form method="get" action="' + Platform.Request.GetRequestURL() + '">');
  Write('<input type="hidden" name="submitted" value="true" />');
  Write('First Name: <input type="text" name="firstName" required /><br/>');
  Write('Email: <input type="email" name="email" required /><br/>');
  Write('<select name="category"><option value="Electronics">Electronics</option>');
  Write('<option value="Apparel">Apparel</option><option value="Home">Home</option></select><br/>');
  Write('<button type="submit">Sign Up</button></form>');
}
</script>
```

**Test:** Submit 3–5 fake signups through the form, confirm rows land in `Subscribers` with `Status = Active`.

---

## 4. Day 2 — Automation Studio

Build in **Automation Studio → New Automation**, name it `EcommerceProgram_DataPrep`.

### 4.1 Activity 1: Import File / File Drop Activity
- Import a CSV of new cart activity (`SubscriberKey, ProductID, DateAdded, Purchased`) from FTP or File Drop into `CartActivity` (overwrite = "Add and Update").
- If you don't have a real FTP source handy, simulate this by manually uploading a CSV via Contact Builder → Data Extension → Import for now, and note in your README that in production this would be a File Drop/FTP trigger.

### 4.2 Activity 2: SQL Query Activity — Abandoned Carts

Target DE: `AbandonedCart_Filtered` (Overwrite Data).

```sql
SELECT
    c.SubscriberKey,
    c.ProductID,
    c.DateAdded,
    s.Email,
    s.FirstName
FROM CartActivity c
INNER JOIN Subscribers s
    ON c.SubscriberKey = s.SubscriberKey
WHERE c.Purchased = 'N'
    AND c.DateAdded <= DATEADD(hour, -24, GETDATE())
```

### 4.3 Activity 3: SQL Query Activity — New Signups (Welcome Journey Entry)

Target DE: `NewSignups_Last24Hrs` (Overwrite Data).

```sql
SELECT
    SubscriberKey,
    Email,
    FirstName,
    CategoryPref,
    SignupDate
FROM Subscribers
WHERE SignupDate >= DATEADD(hour, -24, GETDATE())
    AND Status = 'Active'
```

### 4.4 Activity 4 (optional): Script Activity (SSJS) — Run Log

```html
<script runat="server">
Platform.Load("core", "1.1.1");
var now = Platform.Function.SystemDateToLocalDate(Now());
Write("Automation run completed at: " + Stringify(now));
</script>
```
Use this to demonstrate you understand Script Activities exist for logic Query Activities can't handle (custom formatting, calling APIs, etc.) — even if the logic here is trivial.

### 4.5 Scheduling
Set the automation to run **hourly** (Automation Studio → Starting Source → Schedule). This is what makes it a genuine "automation" rather than a one-off manual run — call this out explicitly when you demo it.

**Test:** Run the automation manually first (Run Once), check that `AbandonedCart_Filtered` and `NewSignups_Last24Hrs` populate correctly based on your seeded data.

---

## 5. Day 3 — Journey Builder

### 5.1 Journey A: Welcome Series
- **Entry Source:** Data Extension → `NewSignups_Last24Hrs`. Set entry mode to re-evaluate on schedule (matches the hourly automation) or single-entry, your call — single-entry is simpler for a demo.
- **Flow:**
  1. Email 1 — "Welcome" (sent immediately on entry)
  2. Wait — 1 day
  3. Email 2 — "Getting Started" tips
  4. Decision Split — "Opened Email 1?" (Email Engagement criteria)
     - Yes → Email 3a — "More products you'll love" (category-personalized)
     - No → Email 3b — "Did you miss this?" (simpler re-send, different subject line)
  5. Wait — 3 days total from entry
  6. Exit

### 5.2 Journey B: Abandoned Cart
- **Entry Source:** Data Extension → `AbandonedCart_Filtered`, re-evaluate on schedule (matches automation cadence).
- **Flow:**
  1. Decision Split — "Purchased since entry?" (use an Update Contact Data / Contact Data activity that re-checks `CartActivity.Purchased`, or a second Data Extension refresh via Contact Data check)
     - Yes → Exit
     - No → continue
  2. Email 1 — "You left something in your cart" (reminder, shows cart items)
  3. Wait — 2 days
  4. Decision Split — "Purchased since Email 1?" (same check)
     - Yes → Exit
     - No → continue
  5. Email 2 — "Here's 10% off" (discount incentive)
  6. Exit

**Note for your README:** In a production build, the "Purchased since entry?" check is commonly done via a **Contact Data Update** or re-running the segmentation automation on a schedule that feeds a fresh entry evaluation — call this out as a known simplification for the demo.

---

## 6. Day 4 — Email Studio (dynamic AMPscript emails)

Build these as Content Builder emails, HTML template + AMPscript blocks.

### 6.1 Welcome Email — basic personalization + conditional content

```html
<h1>Welcome, %%=v(FirstName)=%%!</h1>

%%[ IF CategoryPref == "Electronics" THEN ]%%
  <p>Check out our latest gadgets and tech deals.</p>
%%[ ELSEIF CategoryPref == "Apparel" THEN ]%%
  <p>New arrivals in clothing are waiting for you.</p>
%%[ ELSE ]%%
  <p>Explore what's new across all our categories.</p>
%%[ ENDIF ]%%
```

### 6.2 Abandoned Cart Reminder Email — AMPscript loop pulling cart rows

```html
%%[
VAR @subKey, @rows, @rowCount, @i, @productID, @productName, @price, @imageURL

SET @subKey = _subscriberkey
SET @rows = LookupOrderedRows("CartActivity", 3, "DateAdded DESC",
              "SubscriberKey", @subKey, "Purchased", "N")
SET @rowCount = RowCount(@rows)
]%%

<h2>You left these items in your cart</h2>
<table>
%%[
FOR @i = 1 TO @rowCount DO
  SET @productID = Field(Row(@rows, @i), "ProductID")
  SET @productDetails = LookupRows("Products", "ProductID", @productID)
  SET @productName = Field(Row(@productDetails, 1), "ProductName")
  SET @price = Field(Row(@productDetails, 1), "Price")
  SET @imageURL = Field(Row(@productDetails, 1), "ImageURL")
]%%
  <tr>
    <td><img src="%%=v(@imageURL)=%%" width="100" /></td>
    <td>%%=v(@productName)=%%</td>
    <td>$%%=v(@price)=%%</td>
  </tr>
%%[ NEXT @i ]%%
</table>

<p><a href="%%=RedirectTo('https://yourcloudpage.com/checkout')=%%">Complete your purchase</a></p>
```

### 6.3 Discount Email — same loop pattern + a static discount code block
Reuse the loop from 6.2, add a banner with a discount code (`SAVE10`) above the product table. This reinforces the loop pattern without introducing new AMPscript concepts — good for time efficiency on Day 4.

### 6.4 Testing
- Use **Preview and Test → Test Send** against a few subscriber records with different `CategoryPref` values and different numbers of cart items (including zero, to check your loop handles an empty result set gracefully — add an `IF @rowCount == 0` branch showing a generic message instead of an empty table).

---

## 7. Stretch: Subscription Center CloudPage
Linked from every email footer. Reads `SubscriberKey` from query string, looks up current `Status`, and lets the subscriber toggle `Active`/`Unsubscribed`, writing back via `UpdateDE()`.

```html
%%[
VAR @subKey, @status, @action
SET @subKey = RequestParameter("subKey")
SET @action = RequestParameter("action")

IF NOT EMPTY(@action) THEN
  UpdateDE("Subscribers", "SubscriberKey", @subKey, "Status", @action)
ENDIF

SET @rows = LookupRows("Subscribers", "SubscriberKey", @subKey)
SET @status = Field(Row(@rows, 1), "Status")
]%%

<h2>Manage your preferences</h2>
<p>Current status: %%=v(@status)=%%</p>
<a href="%%=RequestParameter('PAGEURL')=%%?subKey=%%=v(@subKey)=%%&action=Unsubscribed">Unsubscribe</a>
```

---

## 8. Testing Checklist (QA instincts, dev deliverable)
- [ ] Signup form rejects empty email, accepts valid one
- [ ] Automation SQL activities produce correct row counts against seeded data (spot-check manually)
- [ ] Welcome journey: entry, wait timing, and split branch all verified with test contacts
- [ ] Abandoned cart journey: exit-on-purchase logic actually removes a contact when you mark a row `Purchased = 'Y'`
- [ ] Product loop email renders correctly with 0, 1, and 3 cart items
- [ ] Subscription Center correctly updates `Status` and reflects it on reload

## 9. What to say about this in your first week
- Frame it as "I built the full loop — capture, segment, automate, journey, personalize — not just a template."
- Mention the known simplifications (manual CSV vs. real FTP trigger, single-entry vs. re-evaluated journeys) — shows judgment, not just execution.
- Your QA background shows up in the testing checklist above — lead with that as a differentiator.

---

**Next steps if you want to keep going:** Project 2 (Loyalty / Re-Engagement Program) follows the same structure — say the word and I'll produce the same level of end-to-end detail for it.
