package com.nextpari.app.feature.games

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameVisualTest {
    @Test
    fun appleBoardUsesServerRowsAndHidesNothingLocally() {
        val round = round(
            "apples",
            mapOf(
                "activeLevel" to "2",
                "rows" to """[{"level":2,"multiplier":"1.54","cells":[{"kind":"good","revealed":true},{"kind":"bad","revealed":false}]}]""",
            ),
        )
        val board = appleBoard(round)
        assertThat(board).hasSize(1)
        assertThat(board.single().multiplier).isEqualTo("1.54")
        assertThat(board.single().cells[0].revealed).isTrue()
        assertThat(board.single().cells[1].kind).isEqualTo("bad")
        assertThat(appleBoard(null)).hasSize(10)
    }

    @Test
    fun blackjackKeepsTheDealerHoleCardHidden() {
        val faces = cardFaces("""[{"rank":"10","suit":"♦"},{"rank":"7","suit":"♣","isHidden":true}]""")
        assertThat(faces[0].hidden).isFalse()
        assertThat(faces[1].hidden).isTrue()
        assertThat(faces[1].rank).isEqualTo("7")
    }

    @Test
    fun diceCrystalAndPharaohReadOnlyServerFields() {
        val dice = diceFaces("[6,5]")
        assertThat(dice).containsExactly(6, 5).inOrder()
        val gems = crystalGems(
            round(
                "crystal",
                mapOf("startBoard" to """[{"kind":"coin"},{"kind":"red"}]"""),
            ),
        )
        assertThat(gems.map { it.kind }).containsExactly("coin", "red").inOrder()
        val playback = crystalFrames(
            round(
                "crystal",
                mapOf(
                    "startBoard" to """[{"kind":"green"}]""",
                    "steps" to """[{"board":[{"kind":"red"}],"exploding":[true]},{"board":[{"kind":"coin"}],"exploding":[false]}]""",
                ),
            ),
        )
        assertThat(playback).hasSize(3)
        assertThat(playback[0].single().kind).isEqualTo("green")
        assertThat(playback[1].single().exploding).isTrue()
        assertThat(playback[2].single().kind).isEqualTo("coin")
        val tiles = pharaohTiles(round("pharaoh", mapOf("tiles" to """[{"id":"ankh"}]""")))
        assertThat(tiles).containsExactly("ankh")
        assertThat(pharaohPrize(round("pharaoh", mapOf("prize" to """{"id":"lotus"}""")))).isEqualTo("lotus")
    }

    private fun round(code: String, result: Map<String, String>) = PlayerGameRound(
        ok = true,
        isDuplicate = false,
        roundId = "r",
        gameCode = code,
        state = "settled",
        stake = 6.0,
        totalStake = 6.0,
        payout = 0.0,
        balanceAfter = 10.0,
        serverSeedHash = "",
        serverSeed = null,
        nonce = 1,
        sessionId = null,
        mathVersion = null,
        publicResult = result,
        allowedActions = emptyList(),
        createdAt = null,
        settledAt = null,
    )
}
