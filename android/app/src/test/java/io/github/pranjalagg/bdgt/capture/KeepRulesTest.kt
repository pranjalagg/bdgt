package io.github.pranjalagg.bdgt.capture

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class KeepRulesTest {
    private val config = SourceConfig(
        packages = KeepRules.APP_SOURCES.toSet(),
        messagingPackages = KeepRules.MESSAGING_APPS.toSet(),
    )

    private fun app(
        title: String?,
        text: String?,
        pkg: String = KeepRules.WALLET,
        key: String = "0|wallet|7|null|10123",
        postTime: Long = 1_000L,
        bigText: String? = null,
        lines: List<String> = emptyList(),
        isGroupSummary: Boolean = false,
        isOngoing: Boolean = false,
    ) = Candidate(pkg, key, postTime, title, text, bigText, null, lines, emptyList(), isGroupSummary, isOngoing)

    private fun conversation(vararg messages: Message, pkg: String = KeepRules.GOOGLE_MESSAGES, postTime: Long = 5_000L) =
        Candidate(pkg, "0|messages|42|null|10456", postTime, "VM-HDFCBK", messages.lastOrNull()?.text, null, null, emptyList(), messages.toList(), false, false)

    private fun keep(candidate: Candidate) = KeepRules.keep(candidate, config)

    @Test
    fun amountsInEveryCommonForm() {
        listOf(
            "Rs.250.00 debited",
            "Rs 1234 paid",
            "INR 1,234.50",
            "INR1,23,456.00",
            "₹99 sent",
            "₹ 1,200",
            "$4.50 at Blue Bottle",
            "US$ 12",
            "USD 12.00",
            "Paid 250 INR",
            "1,200.50 rupees",
            "€4.50 at Café Nero",
            "£12 with Visa",
            "AED 35.00 spent",
            // SBI writes the amount without a currency sign.
            "Dear UPI user A/C X1234 debited by 250.0 on date 21Oct26 trf to SWIGGY Refno 123456789012",
        ).forEach { assertTrue(it, KeepRules.hasAmount(it)) }
    }

    @Test
    fun noAmountWithoutACurrency() {
        listOf(
            "Your order is out for delivery",
            "See you in 2 hours",
            "hours 2",
            "Mrs 5 called",
            "Call 18002586161",
            "Card ending 1234 added",
        ).forEach { assertFalse(it, KeepRules.hasAmount(it)) }
    }

    @Test
    fun bankMessagesNeedAnAmountAndABankingWord() {
        assertTrue(KeepRules.looksLikeBankMessage("Rs.250.00 debited from A/c XX1234 on 21-10-26 to VPA swiggy@icici. UPI Ref 123456789012"))
        assertTrue(KeepRules.looksLikeBankMessage("Sent Rs.120.00 From HDFC Bank A/C *1234 To RAHUL"))
        assertFalse(KeepRules.looksLikeBankMessage("Get Rs.100 off on your next order!"))
        assertFalse(KeepRules.looksLikeBankMessage("Running late, be there at 5"))
    }

    @Test
    fun businessSenders() {
        listOf("VM-HDFCBK", "AX-KOTAKB-S", "HDFCBK", "SBIUPI", "24273", "HDFC Bank", "Axis Bank Ltd", "Chase").forEach {
            assertTrue(it, KeepRules.isBusinessSender(it))
        }
        listOf("Mom", "Rahul Sharma", "+91 98765 43210", "9876543210", "(415) 555-0100", "", "  ", null).forEach {
            assertFalse(it.toString(), KeepRules.isBusinessSender(it))
        }
    }

    @Test
    fun peopleAreNeverKeptWhateverTheySayAboutMoney() {
        val friend = Message("Rahul", 1_000L, "I paid Rs.500 for the cab, UPI me back")
        val number = Message("+91 98765 43210", 2_000L, "Rs.250 debited, ref 123456789012")
        val mine = Message(null, 3_000L, "Sent you Rs.300 on UPI")
        assertTrue(keep(conversation(friend, number, mine)).isEmpty())
    }

    @Test
    fun otpMessagesAreNeverKept() {
        assertFalse(KeepRules.looksLikeBankMessage("123456 is your OTP for a txn of Rs.500.00 at AMAZON"))
        assertTrue(keep(app("Google Pay", "Your OTP for payment of ₹500 is 4321", pkg = KeepRules.GPAY_INDIA)).isEmpty())
    }

    @Test
    fun walletPaymentIsKept() {
        val kept = keep(app("Blue Bottle Coffee", "$6.50 with Visa •••• 1234")).single()
        assertEquals("app", kept.kind)
        assertEquals("Blue Bottle Coffee", kept.title)
        assertEquals("$6.50 with Visa •••• 1234", kept.text)
        assertEquals(1_000L, kept.postedAt)
        assertEquals(null, kept.sender)
    }

    @Test
    fun appNotificationWithoutAnAmountIsDropped() {
        assertTrue(keep(app("Google Wallet", "Your card is ready to use")).isEmpty())
    }

    @Test
    fun theAmountMayBeInTheTitle() {
        assertEquals(1, keep(app("₹250 paid to Swiggy", "UPI transaction successful", pkg = KeepRules.PHONEPE)).size)
    }

    @Test
    fun expandedTextAndLinesAreKept() {
        val kept = keep(
            app(
                "PhonePe",
                "Paid ₹250",
                pkg = KeepRules.PHONEPE,
                bigText = "Paid ₹250 to Swiggy. UPI Ref 123456789012",
                lines = listOf("From HDFC Bank"),
            ),
        ).single()
        assertEquals("Paid ₹250 to Swiggy. UPI Ref 123456789012\nFrom HDFC Bank", kept.text)
    }

    @Test
    fun summariesOngoingAndOtherAppsAreDropped() {
        assertTrue(keep(app("Wallet", "$5.00 at Cafe", isGroupSummary = true)).isEmpty())
        assertTrue(keep(app("Wallet", "$5.00 at Cafe", isOngoing = true)).isEmpty())
        assertTrue(keep(app("Chat", "Send me $5", pkg = "com.whatsapp")).isEmpty())
    }

    @Test
    fun messagingAppsAreSkippedWhenSmsIsOff() {
        val noSms = config.copy(messagingPackages = emptySet())
        val bank = Message("VM-HDFCBK", 1L, "Rs.250.00 debited from A/c XX1234")
        assertTrue(KeepRules.keep(conversation(bank), noSms).isEmpty())
    }

    @Test
    fun onlyBankMessagesOfAConversationAreKept() {
        val bank = Message("VM-HDFCBK", 1_000L, "Rs.250.00 debited from A/c XX1234 to swiggy@icici")
        val chat = Message("Mom", 2_000L, "Dinner at 8?")
        val kept = keep(conversation(bank, chat))
        assertEquals(listOf(bank.text), kept.map { it.text })
        assertEquals("sms", kept[0].kind)
        assertEquals("VM-HDFCBK", kept[0].sender)
        assertEquals(1_000L, kept[0].postedAt)
    }

    @Test
    fun aRepostedConversationKeepsTheSameIds() {
        val first = Message("VM-HDFCBK", 1_000L, "Rs.250.00 debited from A/c XX1234")
        val second = Message("VM-HDFCBK", 9_000L, "Rs.80.00 debited from A/c XX1234")
        val before = keep(conversation(first)).map { it.id }
        val after = keep(conversation(first, second, postTime = 10_000L)).map { it.id }
        assertEquals(before[0], after[0])
        assertEquals(2, after.toSet().size)
    }

    @Test
    fun aPlainSmsNotificationIsOneMessage() {
        val c = Candidate(
            KeepRules.SAMSUNG_MESSAGES, "k", 3_000L, "AD-ICICIB", "INR 500.00 spent on ICICI Bank Card XX9876",
            null, null, emptyList(), emptyList(), false, false,
        )
        val kept = keep(c).single()
        assertEquals("AD-ICICIB", kept.sender)
        assertEquals(3_000L, kept.postedAt)
        assertEquals("INR 500.00 spent on ICICI Bank Card XX9876", kept.text)
    }

    @Test
    fun appIdsFollowTheKeyAndPostTime() {
        val a = keep(app("Blue Bottle", "$5.00 with Visa", postTime = 1_000L)).single()
        val same = keep(app("Blue Bottle", "$5.00 with Visa", postTime = 1_000L)).single()
        val later = keep(app("Blue Bottle", "$5.00 with Visa", postTime = 600_000L)).single()
        val otherKey = keep(app("Blue Bottle", "$5.00 with Visa", key = "0|wallet|8|null|10123")).single()
        assertEquals(a.id, same.id)
        assertNotEquals(a.id, later.id)
        assertNotEquals(a.id, otherKey.id)
        assertEquals(32, a.id.length)
    }

    @Test
    fun theRepostRule() {
        val first = keep(app("Blue Bottle", "$5.00 with Visa", postTime = 1_000L)).single()
        val repost = keep(app("Blue Bottle", "$5.00 with Visa", postTime = 61_000L)).single()
        val muchLater = keep(app("Blue Bottle", "$5.00 with Visa", postTime = 1_000L + 121_000L)).single()
        val changed = keep(app("Blue Bottle", "$5.50 with Visa", postTime = 61_000L)).single()
        assertTrue(KeepRules.isRepost(first, repost))
        assertFalse(KeepRules.isRepost(first, muchLater))
        assertFalse(KeepRules.isRepost(first, changed))
        assertFalse(KeepRules.isRepost(null, first))
    }
}
