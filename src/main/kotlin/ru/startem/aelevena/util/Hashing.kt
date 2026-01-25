package ru.startem.aelevena.util

import java.security.MessageDigest

object Hashing {
    fun sha256Hex(bytes: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digest.joinToString(separator = "") { b -> "%02x".format(b) }
    }
}

