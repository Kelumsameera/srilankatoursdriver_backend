# Titan email setup

All outgoing mail uses Titan SMTP only: `smtp.titan.email:465` with implicit TLS,
username `info@srilankatoursdriver.com`, sender
`Sri Lanka Tours Driver <info@srilankatoursdriver.com>`. Environment validation rejects
other providers, usernames, ports and senders. No Gmail SMTP fallback is used.

Set `SMTP_PASSWORD` securely in backend `.env` (or the deployment secret store) to
this Titan mailbox password. If 2FA is enabled, use a Titan application password.
Enable third-party email access in Titan where required. Never use a Gmail password,
put credentials in frontend variables, or paste credentials into logs/chat.
The previous local credentials belonged to another account and were removed from
the SMTP password setting rather than reused with Titan.

`NOTIFY_EMAIL=info@srilankatoursdriver.com,srilankatoursdriver@gmail.com`
selects both admin recipients. Admin messages retain the reference, customer,
trip, dates, party, pickup, price and other submitted fields, with customer Reply-To.
The existing separate guest acknowledgement contains the reference and fixed text.
It acknowledges receipt of a request, not a final reservation approval.

Run `npm run verify:email` after setting the password, then restart the backend.
Startup also verifies SMTP without blocking booking API availability. Verification
checks connection/authentication only; it does not prove sender authorization,
recipient acceptance or inbox delivery. 535/EAUTH means Titan rejected authentication:
check the mailbox password, third-party access and app password settings.
Only safe error codes and recipient counts are logged, never raw SMTP errors.

`npm run test:email` uses mocked SMTP and settings; no external messages are sent.
`npm run typecheck`, `npm run lint`, and `npm run build` validate the backend.

A send succeeds only when SMTP accepts every intended recipient and rejects none.
Partial acceptance returns false; the separate guest acknowledgement still runs.
There are no automatic SMTP retries: a timeout after DATA can mean SMTP already
accepted the message. Never retry all recipients after partial acceptance.
Existing booking duplicate detection remains unchanged. Notification replays and
concurrent calls with the same kind/reference are suppressed in memory for 15 minutes.
This guard is process-local and does not guarantee exactly-once delivery across
restarts or multiple instances. A durable delivery ledger/outbox would be needed
before adding automatic retries across instances. Failed notifications are logged;
bookings remain saved and API success indicates request creation, not email delivery.

After credentials are configured, perform an explicitly marked test booking using a
controlled customer inbox. Check both admin inboxes and the customer inbox separately,
including spam folders. SMTP acceptance does not guarantee final inbox delivery.
No production deployment is performed by this setup.

All booking notifications, guest acknowledgements and password-reset messages include
an HTML signature with ?Best regards?, the CMS logo, business name, official mailbox
and website link. Plain-text messages carry the same contact details. A failed branding
lookup uses a public logo fallback and never prevents the message from being sent.
Only HTTPS logo/website URLs without embedded credentials are used.

Never store the real SMTP password in tests. Tests use a transport override and an
empty password, with dotenv pointed away from the real environment file. Any password
previously committed must be rotated at Titan; deleting it from the latest version
does not remove it from Git history.

Recorded Tripadvisor award years are shown in the signature, using the same green
PNG badges as the website. Email badge images are published on Cloudinary so they
do not depend on a frontend deployment. PNG/SVG source assets remain in the frontend's
`public/images/awards/` folder; only explicitly recorded years are claimed. New award years
can be entered in Site Settings, and matching image assets can be added when supplied.
