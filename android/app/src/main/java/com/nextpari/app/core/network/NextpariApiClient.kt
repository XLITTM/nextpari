package com.nextpari.app.core.network

/**
 * Abstraction over future Nextpari HTTP APIs.
 *
 * A001 does not invent backend contracts and does not make authenticated
 * production calls. Repositories currently use local mock implementations.
 */
interface NextpariApiClient {
    val baseUrl: String
}

class RetrofitNextpariApiClient(
    override val baseUrl: String,
) : NextpariApiClient
