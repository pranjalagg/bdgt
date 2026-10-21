package io.github.pranjalagg.bdgt.auth

import androidx.core.content.ContextCompat
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException

// Google sign-in for the web app (src/lib/sync/googleAuth.ts). Google refuses
// to sign in inside a WebView, so the phone's own "Sign in with Google" sheet
// (Credential Manager) returns an ID token for the web client, which Supabase
// exchanges for a session. The page supplies the hashed nonce.
@CapacitorPlugin(name = "GoogleAuth")
class GoogleAuthPlugin : Plugin() {
    @PluginMethod
    fun idToken(call: PluginCall) {
        val serverClientId = call.getString("serverClientId") ?: return call.reject("serverClientId is required")
        val nonce = call.getString("nonce") ?: return call.reject("nonce is required")
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(serverClientId).setNonce(nonce).build())
            .build()
        val callback = object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
            override fun onResult(result: GetCredentialResponse) {
                // Parsed rather than matched on type: the sheet and the one-tap
                // flow label their Google credentials differently.
                val credential = result.credential
                val token = if (credential is CustomCredential) {
                    try {
                        GoogleIdTokenCredential.createFrom(credential.data).idToken
                    } catch (e: GoogleIdTokenParsingException) {
                        null
                    }
                } else {
                    null
                }
                if (token == null) call.reject("Google did not return an ID token", "failed")
                else call.resolve(JSObject().apply { put("idToken", token) })
            }

            override fun onError(e: GetCredentialException) {
                when (e) {
                    is GetCredentialCancellationException -> call.reject("Sign-in was cancelled", "canceled")
                    is NoCredentialException -> call.reject(e.message ?: "No credentials available", "no-account")
                    else -> call.reject(e.message ?: e.type, "failed")
                }
            }
        }
        activity.runOnUiThread {
            CredentialManager.create(context).getCredentialAsync(
                activity,
                request,
                null,
                ContextCompat.getMainExecutor(context),
                callback,
            )
        }
    }
}
