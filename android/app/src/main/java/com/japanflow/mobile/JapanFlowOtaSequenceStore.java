package com.japanflow.mobile;

import android.content.Context;
import android.content.SharedPreferences;

public final class JapanFlowOtaSequenceStore {

    private static final String STORE =
        "japanflow_ota_security_v1";

    private static final String ACCEPTED =
        "accepted_sequence";

    private static final String PENDING =
        "pending_sequence";

    private static final String PENDING_BUNDLE =
        "pending_bundle";

    private static final String ATTEMPTED =
        "highest_attempted_sequence";

    private static final long MAX_SEQUENCE =
        9007199254740991L;

    private JapanFlowOtaSequenceStore() {}

    private static SharedPreferences preferences(
        Context context
    ) {
        return context.getSharedPreferences(
            STORE,
            Context.MODE_PRIVATE
        );
    }

    private static boolean validSequence(long value) {
        return value > 0 && value <= MAX_SEQUENCE;
    }

    public static synchronized long accepted(
        Context context
    ) {
        return preferences(context)
            .getLong(ACCEPTED, 0);
    }

    public static synchronized long attempted(
        Context context
    ) {
        return preferences(context)
            .getLong(ATTEMPTED, 0);
    }

    public static synchronized long pending(
        Context context
    ) {
        return preferences(context)
            .getLong(PENDING, 0);
    }

    public static synchronized String pendingBundle(
        Context context
    ) {
        return preferences(context)
            .getString(PENDING_BUNDLE, "");
    }

    public static synchronized boolean canAttempt(
        Context context,
        long sequence
    ) {
        return validSequence(sequence)
            && pending(context) == 0
            && sequence > accepted(context)
            && sequence > attempted(context);
    }

    static synchronized boolean reserve(
        Context context,
        long sequence,
        String bundleId
    ) {
        if (
            bundleId == null ||
            !bundleId.matches("[A-Za-z0-9_-]{1,128}") ||
            !canAttempt(context, sequence)
        ) {
            return false;
        }

        return preferences(context)
            .edit()
            .putLong(PENDING, sequence)
            .putString(PENDING_BUNDLE, bundleId)
            .putLong(ATTEMPTED, sequence)
            .commit();
    }

    static synchronized boolean confirm(
        Context context,
        long sequence,
        String bundleId
    ) {
        if (
            !validSequence(sequence) ||
            sequence != pending(context) ||
            bundleId == null ||
            !bundleId.equals(pendingBundle(context)) ||
            sequence <= accepted(context)
        ) {
            return false;
        }

        return preferences(context)
            .edit()
            .putLong(ACCEPTED, sequence)
            .remove(PENDING)
            .remove(PENDING_BUNDLE)
            .commit();
    }

    static synchronized boolean fail(
        Context context,
        long sequence,
        String bundleId
    ) {
        if (
            !validSequence(sequence) ||
            sequence != pending(context) ||
            bundleId == null ||
            !bundleId.equals(pendingBundle(context))
        ) {
            return false;
        }

        return preferences(context)
            .edit()
            .remove(PENDING)
            .remove(PENDING_BUNDLE)
            .commit();
    }
}
