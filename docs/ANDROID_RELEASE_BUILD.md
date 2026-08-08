# Android Release Build

This guide produces the signed Android App Bundle (AAB) for DukaPilot.

## Scope

- Android package: `com.dukapilot.app`
- Production web host: `https://www.dukapilot.com`
- Release format: Android App Bundle (`.aab`)
- Google Play upload key: local only; never commit it or its password.

## One-Time Local Setup

1. Keep the upload keystore outside the repository. The current expected local path is:

   ```text
   C:/Users/USER/DukaPilot-Secrets/dukapilot-upload-2026.jks
   ```

2. Copy `android/keystores/signing.properties.example` to
   `android/keystores/signing.properties`.

3. Fill in `storePassword` and `keyPassword` locally. The file is ignored by Git.

   ```properties
   storeFile=C:/Users/USER/DukaPilot-Secrets/dukapilot-upload-2026.jks
   storePassword=local-secret
   keyAlias=dukapilot-upload
   keyPassword=local-secret
   ```

   Alternatively, provide the same values through these environment variables:

   ```text
   DUKAPILOT_UPLOAD_STORE_FILE
   DUKAPILOT_UPLOAD_STORE_PASSWORD
   DUKAPILOT_UPLOAD_KEY_ALIAS
   DUKAPILOT_UPLOAD_KEY_PASSWORD
   ```

4. Store the keystore and passwords in the team's password manager and a secure backup. Do not put them in GitHub, Vercel, Railway, screenshots, release notes, or chat.

## Before Every Release

1. Confirm `main` is current and the production web app is healthy.

   ```powershell
   git pull --ff-only origin main
   cd backend
   npm run monitor:prod
   ```

2. Update the version in both files. `versionCode` must be a new integer greater than every Play Console upload; `versionName` is the customer-visible version.

   - `app/build.gradle`: `versionCode` and `versionName`
   - `android/twa-manifest.json`: `appVersionCode` and `appVersion`

3. Keep the values synchronized. The current release baseline is `1.0.4` / `versionCode 5`.

4. Verify the Android wrapper uses the production domain, API 36 target, current logo assets, and correct shortcuts. Do not enable delegated Android notifications until that delivery path is implemented and tested.

## Build The Signed AAB

From the repository root in PowerShell:

```powershell
.\gradlew.bat :app:clean :app:bundleRelease --no-daemon
```

The upload artifact is created at:

```text
app/build/outputs/bundle/release/app-release.aab
```

Do not upload a debug APK or any file from `app/build/outputs/apk/debug/` to Play Console.

## Verify Before Uploading

Run these checks from the repository root:

```powershell
$aab = Resolve-Path 'app\build\outputs\bundle\release\app-release.aab'
Get-Item $aab | Select-Object Name, Length, LastWriteTime
Get-FileHash $aab -Algorithm SHA256

$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
& $keytool -printcert -jarfile $aab | Select-String 'SHA1:'

$jarsigner = Join-Path $env:JAVA_HOME 'bin\jarsigner.exe'
& $jarsigner -verify -certs $aab
```

The SHA-1 must match the active **upload certificate** shown in Google Play Console, not necessarily the app-signing certificate. A successful `jarsigner` verification and matching SHA-1 are required before upload.

Also run the wrapper and web checks:

```powershell
.\gradlew.bat :app:assembleDebug --no-daemon
cd frontend
npm run typecheck
npm run build
```

## Google Play Console Release

1. Go to **Testing** or **Production** for DukaPilot.
2. Select **Create new release**.
3. Upload `app-release.aab`.
4. Confirm Play recognizes the intended version code and no signing warning appears.
5. Add concise English and Swahili release notes when appropriate.
6. Save, review the pre-launch report, then send the release for review or roll it out.
7. After publication, install from Play on a real Android phone and verify launch, sign-in, sales, stock, debts, language switching, offline recovery, and Android long-press shortcuts.

## After Release

1. Record the release version, version code, Play rollout track, date, and AAB SHA-256 in the release notes or changelog.
2. Confirm the installed app opens `https://www.dukapilot.com` without a browser address bar. If it falls back to a browser tab, check `/.well-known/assetlinks.json` and the current Play app-signing certificate fingerprint.
3. Monitor Railway health, Vercel errors, Sentry, and Play Console crash/ANR reports for the first 24 hours.
4. Keep the previous published release available for a staged rollback if needed.

## Troubleshooting

| Problem | Check |
| --- | --- |
| `signReleaseBundle` fails | Confirm `android/keystores/signing.properties` exists, all four values are set, and the keystore path is valid. |
| Play rejects the upload key | Compare the AAB SHA-1 with the active upload certificate in Play Console. Do not generate a new key unless a reset is required. |
| Play rejects the version | Increase `versionCode` in both Android version locations and build a new AAB. |
| App opens with browser chrome | Verify Digital Asset Links at `https://www.dukapilot.com/.well-known/assetlinks.json` include the Play app-signing fingerprint. |
| Build fails after a tool upgrade | Run `git diff`, restore only the intended tooling change if needed, then use the Gradle/AGP versions recorded in the repository. |

## Security Rules

- Never commit `.jks`, `signing.properties`, passwords, or key material.
- Never paste signing passwords into terminal history, issue trackers, or chat.
- A new Play upload key applies only after Google Play approves its reset; until then, use the currently active upload key.
- The generated `.aab` is ignored by Git. Retain the SHA-256 with the corresponding Play release record.
