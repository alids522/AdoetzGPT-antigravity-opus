package com.adoetz.gpt.live;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import com.adoetz.gpt.MainActivity;
import com.adoetz.gpt.R;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class LiveConversationService extends Service {
    public static final String ACTION_START = "com.adoetz.gpt.live.START";
    public static final String ACTION_STOP = "com.adoetz.gpt.live.STOP";

    private static final String CHANNEL_ID = "adoetzgpt_live_conversation";
    private static final int NOTIFICATION_ID = 2407;
    private static final AtomicBoolean ACTIVE = new AtomicBoolean(false);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private AudioRecord audioRecord;
    private PowerManager.WakeLock wakeLock;

    public static boolean isActive() {
        return ACTIVE.get();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_STOP.equals(action)) {
            stopLiveConversation();
            stopSelf();
            return START_NOT_STICKY;
        }

        startForeground(NOTIFICATION_ID, buildNotification());
        startLiveConversation();
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopLiveConversation();
        executor.shutdownNow();
        super.onDestroy();
    }

    private void startLiveConversation() {
        if (ACTIVE.getAndSet(true)) return;

        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "AdoetzGPT:LiveConversation");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();

        executor.execute(() -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                ACTIVE.set(false);
                return;
            }

            int sampleRate = 24000;
            int bufferSize = Math.max(
                    AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT),
                    sampleRate
            );

            audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    sampleRate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize
            );

            short[] buffer = new short[bufferSize / 2];
            audioRecord.startRecording();

            while (ACTIVE.get() && !Thread.currentThread().isInterrupted()) {
                audioRecord.read(buffer, 0, buffer.length);
            }
        });
    }

    private void stopLiveConversation() {
        ACTIVE.set(false);

        if (audioRecord != null) {
            try {
                audioRecord.stop();
            } catch (IllegalStateException ignored) {
            }
            audioRecord.release();
            audioRecord = null;
        }

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            wakeLock = null;
        }
    }

    private Notification buildNotification() {
        createNotificationChannel();

        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_mic)
                .setContentTitle("AdoetzGPT live conversation")
                .setContentText("Microphone active. Tap to return to the app.")
                .setOngoing(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Live conversation",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shows when AdoetzGPT is actively listening for live conversation.");

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }
}
