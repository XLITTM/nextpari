package com.nextpari.app.core.network

/**
 * Abstraction over Nextpari HTTP APIs.
 */
interface NextpariApiClient {
    val baseUrl: String
}

class RetrofitNextpariApiClient(
    override val baseUrl: String,
) : NextpariApiClient
