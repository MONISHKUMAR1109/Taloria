# TALORIA — error codes

Standard error envelope (spec §26):

```json
{
  "success": false,
  "error": {
    "code": "TOURNAMENT_FULL",
    "message": "This tournament has reached its participant limit and you've been added to the waitlist instead.",
    "details": null
  }
}
```

`code` is a stable, machine-readable string. Raw stack traces and SQL errors are
logged server-side only and never returned to the client.

| HTTP | Code | Meaning |
| ---- | ---- | ------- |
| 400 | `VALIDATION_ERROR` | Invalid body / query shape. `details` lists offending fields. |
| 400 | `FILE_TYPE_UNSUPPORTED` | Upload rejected by magic-byte signature. |
| 400 | `FILE_TOO_LARGE` | Upload exceeded its size limit. |
| 400 | `VIDEO_LIMIT_REACHED` | Athlete has 3 performance videos already. |
| 400 | `STAT_TEMPLATE_MISMATCH` | `stat_values` do not match the sport's `stat_template`. |
| 400 | `EMAIL_VERIFICATION_INVALID` | Verification token invalid. |
| 400 | `EMAIL_VERIFICATION_EXPIRED` | Verification token expired (24h). |
| 400 | `PASSWORD_RESET_INVALID` | Reset token invalid. |
| 400 | `PASSWORD_RESET_EXPIRED` | Reset token expired (1h). |
| 400 | `ROLE_CHANGE_NOT_ALLOWED` | Target role equals current role. |
| 400 | `BLOCKED_ACTION` | Admin tried to suspend self / invalid transition. |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password (same message whether or not the email exists). |
| 401 | `UNAUTHORIZED` | Missing/invalid/expired access token. |
| 401 | `TOKEN_INVALID` / `TOKEN_EXPIRED` | Access token expired or malformed. |
| 401 | `ACCOUNT_SUSPENDED` | Suspended account (403). |
| 403 | `FORBIDDEN` | Authenticated but wrong role / not the owner. |
| 403 | `ROLE_NOT_ALLOWED` | Role not permitted for the action. |
| 403 | `BLOCKED` | Athlete blocked this scout thread. |
| 404 | `NOT_FOUND` | Resource or route not found. |
| 409 | `EMAIL_TAKEN` | Duplicate email at registration. |
| 409 | `ALREADY_APPLIED` | Duplicate tournament application. |
| 409 | `TOURNAMENT_NOT_OPEN` | Tournament not accepting applications. |
| 409 | `TOURNAMENT_DEADLINE_PASSED` | Server-side deadline rejection. |
| 409 | `TOURNAMENT_ILLEGAL_TRANSITION` | Illegal status change in the state machine. |
| 409 | `TOURNAMENT_FULL` | Participant limit reached (approval). |
| 409 | `APPLICANT_NOT_PENDING` | Cannot decide an application in its current status. |
| 409 | `SPONSORSHIP_SLOT_FULL` | All package slots taken. |
| 409 | `SPONSORSHIP_ALREADY_REQUESTED` | Duplicate sponsorship request for a package. |
| 409 | `SPONSORSHIP_NOT_PENDING` | Request already decided. |
| 409 | `VERIFICATION_ALREADY_PENDING` | Verification request already pending / already verified. |
| 409 | `PARTICIPANT_ALREADY_EXISTS` | Participant already added. |
| 429 | `RATE_LIMITED` | Too many requests (auth: 10/min/IP). |
| 500 | `INTERNAL_ERROR` | Unexpected server error (trace logged server-side). |