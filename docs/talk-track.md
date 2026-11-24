# Talk track

<!-- The source for the Talk track view and the presenter mode. Written once with {{castBrand}}-style tokens; the three vertical packs
     (retail, health, finance) and customer.config.json fill them. A test fails on a token no pack defines. A heading that starts with
     "S01:" to "S11:" belongs to the story of the same number. Keep every section short enough to say in a minute. -->

## Before you start

You are about to show one external inspector on an LLM key, and the authority setting that decides whether its findings block or only advise. Say first what is sourced and what is not. The only claims taken from the 2026-11-21 release notes are these: a key can use an external inspector in AI Guard, a key has one, and an authority setting can hold it advisory. Everything else on the screen is this lab's own model and is labelled UNVERIFIED. The banner stays on screen in presenter mode too.

The story is told for {{castBrand}}, an invented example. The verticals change the words, not the inspectors and not the numbers.

## What is simulated, and what is not

Everything is simulated: the three inspectors (Model Armor, Azure AI Content Safety and Bedrock Guardrails are lab stubs with fixed rules), the model, the gateway and the lab clock. Nothing leaves this machine, and a guard refuses any outbound call. Real mode is not built; its toggle is disabled with the reason.

Say plainly that the stub rules say nothing about how any real inspector detects anything. The lab does not know whether the product offers fail open or fail closed, what its timeout is, what a client receives when a call is blocked, or whether the answer is inspected as well as the prompt. The Limits page lists each of these, and the category names: Model Armor's follow Google's public overview and still need re-checking, and the other two are the lab's own labels.

## S01: A harmless prompt passes the inspector

Run the first scenario: {{castApp}} calls with {{castKey}} while it is {{castTask}}. The prompt is inspected on the way in, the model answers, and the answer is inspected on the way out. No findings, and the client gets its answer. Point at the three steps in the call path and the lab time each took. An inspector has to stay out of the way when there is nothing to find.

## S02: A prompt injection is stopped by the gateway

Run the second scenario. The prompt tells the model to ignore its instructions. The inspector reports a prompt injection finding and, because the key is enforcing, the gateway answers with its own refusal. Say what is on screen: the refusal comes from the gateway, not from the model, and the model was never called, so no tokens were spent. The wording and the status are the lab's own and UNVERIFIED.

## S03: A card number in the prompt never reaches the model

The prompt carries a payment card number. The inspector reports sensitive data and the gateway blocks. Point at the prompt on screen: the lab masks the number everywhere it shows it, and so should anything you build on top. The model was not called.

## S04: A card number in the model's answer is caught on the way out

This time the prompt is clean and the model stub is told, with a lab directive in the prompt, to answer with a card number. Show the directive: it is how a scenario makes the model misbehave and it is not a product feature. The response inspection finds the data and the gateway withholds the answer. Point at the tokens: they are spent, because the model had already answered. Whether the product inspects the answer at all is UNVERIFIED.

## S05: A link on the stub's list is blocked

The prompt links to a host on the stub's list, a reserved name that never resolves. The inspector reports a malicious URL and the gateway blocks. Be careful with the words: the list is the lab's own, it is not threat intelligence, and it says nothing about what any vendor knows.

## S06: Advisory authority logs the finding; enforcing blocks it again

This is the main lesson, and the page shows it as a pair. Same prompt, same finding. With the authority cap on advisory the finding is written to the gateway log and the call goes through; with it back on enforcing the very same prompt is blocked. The team that owns it, {{castOwner}}, can use advisory to watch the inspector on live traffic before it is allowed to block anything. The release notes say the cap exists; what the log entry looks like is the lab's model.

## S07: The inspector is down: fail closed blocks, fail open lets it through

The inspector cannot be reached. With fail closed, even a harmless prompt is blocked with a named error, and the lab says which. With fail open the call goes through unchecked and the gateway log says it failed open. {{castBrand}} would choose by what an unchecked call costs against what a blocked one costs. Say that the lab does not know whether the product offers either setting.

## S08: A slow inspector hits its timeout

The inspector answers in 800 ms of lab time and the key waits 500. The gateway gives up at 500, and that is a timeout, not a finding: the injection in the prompt is not even seen. Closed blocks, open lets it through. The 500 ms default is the lab's own; the product's timeout, and whether it can be set, are UNVERIFIED.

## S09: Unreadable findings are a named error, never a pass

The inspector answers, but not in a shape the gateway can read. The result is a named error and the model is not called. Run it with fail open and with advisory too: neither turns it into a pass, because they cover an unreachable inspector and a finding, not an unreadable answer. This is the lab's own decision about what is safe.

## S10: A second inspector replaces the first

The key starts with the Model Armor stub. Select the Azure stub and the first is replaced, not joined: the result says which one went. The same injection now comes back with the second stub's own category name, which is a lab label.

## S11: Two inspectors at once are refused

Ask for two inspectors in one request. It is refused with a named error and the key keeps what it had; run a prompt afterwards to show the first inspector is still in place. The release notes say a key has one inspector; the refusal and its wording are the lab's.
