# Security Specification — Thế Giới Vi Khuẩn 3D (Teacher-Rostered Classroom Mode)

## 1. Data Invariants
1. **Default Deny**: All unmatched paths are denied (`allow read, write: if false`).
2. **Teacher-Only Roster Management**: Only an authenticated, email-verified teacher (`isTeacher()`) may create, update, or delete `/classes/{classId}`, or update/delete `/submissions/{submissionId}`.
3. **Roster-Verified Student Submissions (No Student Login Required)**: Any student may create a `/submissions/{submissionId}` document without signing in ONLY if:
   - The referenced `/classes/$(incoming().classId)` exists and `isActive == true`.
   - `incoming().className` and `incoming().grade` strictly match the parent class roster.
   - `incoming().studentName` is strictly present in `classDoc.students`.
   - All fields match strict `hasAll` + `hasOnly` allowlists, type/size/range bounds, and `submittedAt == request.time`.
4. **Zero PII Exposure**: Neither `/classes` nor `/submissions` stores email, phone, or address fields.
5. **No Self-Assigned Teacher Privileges**: `/admins/{adminUid}` denies all client writes.

## 2. The "Dirty Dozen" Adversarial Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Class Creation**: Student creates `/classes/fake_class` with `auth = null`.
2. **Non-Teacher Class Modification**: Signed-in non-teacher modifies `/classes/c1`.
3. **Spoofed Teacher Email**: Signed-in user with `email == 'ngockim232@gmail.com'` and `email_verified == false` attempts to create a class.
4. **Submission for Non-Existent Class**: Student submits with `classId: "does_not_exist"`.
5. **Submission for Inactive Class**: Student submits to a class with `isActive: false`.
6. **Unlisted Student Name Spoofing**: Student submits `studentName: "Hacker"` not present in `classDoc.students`.
7. **Grade / ClassName Mismatch**: Student submits `grade: 9` while parent class has `grade: 6`.
8. **Shadow / Ghost Field Injection**: Student submits extra field `email: "leak@x.com"` or `isTeacher: true`.
9. **Score Tampering Out-of-Bounds**: Student submits `score: 9999` or `correctCount: 50`.
10. **Client Timestamp Forgery**: Student submits `submittedAt` not equal to `request.time`.
11. **Unauthorized Student Tampering with Existing Submission**: Student tries to `update` or `delete` any `/submissions/{id}`.
12. **ID Poisoning & Array Overflow**: Creating a class with >60 students or invalid ID characters `../bad!`.
