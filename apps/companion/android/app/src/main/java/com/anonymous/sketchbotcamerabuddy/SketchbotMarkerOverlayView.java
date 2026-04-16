package com.anonymous.sketchbotcamerabuddy;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

import org.json.JSONArray;
import org.json.JSONObject;

public class SketchbotMarkerOverlayView extends View {
    private final Paint tagStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint tagFillPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint borderStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint borderDotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint labelBgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint labelTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

    private String overlayPayload = "{\"detections\":[],\"canvasBorder\":{\"corners\":[],\"detected\":false}}";

    public SketchbotMarkerOverlayView(Context context) {
        super(context);
        init();
    }

    public SketchbotMarkerOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        setWillNotDraw(false);
        setBackgroundColor(Color.TRANSPARENT);

        tagStrokePaint.setStyle(Paint.Style.STROKE);
        tagStrokePaint.setStrokeWidth(5f);
        tagStrokePaint.setColor(Color.parseColor("#7BE0FF"));
        tagStrokePaint.setStrokeJoin(Paint.Join.ROUND);

        tagFillPaint.setStyle(Paint.Style.FILL);
        tagFillPaint.setColor(Color.argb(26, 123, 224, 255));

        borderStrokePaint.setStyle(Paint.Style.STROKE);
        borderStrokePaint.setStrokeWidth(4f);
        borderStrokePaint.setColor(Color.parseColor("#FF4F8C"));

        borderDotPaint.setStyle(Paint.Style.FILL);
        borderDotPaint.setColor(Color.parseColor("#FF4F8C"));

        labelBgPaint.setStyle(Paint.Style.FILL);
        labelBgPaint.setColor(Color.argb(220, 4, 10, 20));

        labelTextPaint.setColor(Color.WHITE);
        labelTextPaint.setTextSize(28f);
        labelTextPaint.setFakeBoldText(true);
    }

    public void setOverlayPayload(String overlayPayload) {
        this.overlayPayload = overlayPayload != null ? overlayPayload : this.overlayPayload;
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int width = getWidth();
        int height = getHeight();
        if (width <= 0 || height <= 0) {
            return;
        }

        try {
            JSONObject root = new JSONObject(overlayPayload);
            JSONArray detections = root.optJSONArray("detections");
            if (detections != null) {
                for (int i = 0; i < detections.length(); i++) {
                    JSONObject detection = detections.optJSONObject(i);
                    if (detection == null) {
                        continue;
                    }
                    drawDetection(canvas, detection, width, height);
                }
            }

            JSONObject canvasBorder = root.optJSONObject("canvasBorder");
            if (canvasBorder != null && canvasBorder.optBoolean("detected", false)) {
                JSONArray corners = canvasBorder.optJSONArray("corners");
                if (corners != null && corners.length() >= 4) {
                    drawCanvasBorder(canvas, corners, width, height);
                }
            }
        } catch (Exception ignored) {
            // Keep the view resilient; a malformed payload should simply not draw.
        }
    }

    private void drawDetection(Canvas canvas, JSONObject detection, int width, int height) {
        JSONArray corners = detection.optJSONArray("corners");
        if (corners == null || corners.length() < 4) {
            return;
        }

        Path path = new Path();
        float minX = Float.MAX_VALUE;
        float minY = Float.MAX_VALUE;

        for (int i = 0; i < corners.length(); i++) {
            JSONObject corner = corners.optJSONObject(i);
            if (corner == null) {
                continue;
            }

            float x = (float) corner.optDouble("x", 0) * width;
            float y = (float) corner.optDouble("y", 0) * height;

            if (i == 0) {
                path.moveTo(x, y);
            } else {
                path.lineTo(x, y);
            }

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
        }
        path.close();

        canvas.drawPath(path, tagFillPaint);
        canvas.drawPath(path, tagStrokePaint);

        String label = "Tag " + detection.optInt("tagId", -1);
        float textWidth = labelTextPaint.measureText(label);
        float labelLeft = Math.max(8f, minX);
        float labelTop = Math.max(8f, minY - 42f);
        RectF labelRect = new RectF(labelLeft - 10f, labelTop - 8f, labelLeft + textWidth + 14f, labelTop + 36f);
        canvas.drawRoundRect(labelRect, 18f, 18f, labelBgPaint);
        canvas.drawText(label, labelLeft, labelTop + 20f, labelTextPaint);
    }

    private void drawCanvasBorder(Canvas canvas, JSONArray corners, int width, int height) {
        Path path = new Path();

        for (int i = 0; i < corners.length(); i++) {
            JSONObject corner = corners.optJSONObject(i);
            if (corner == null) {
                continue;
            }

            float x = (float) corner.optDouble("x", 0) * width;
            float y = (float) corner.optDouble("y", 0) * height;

            if (i == 0) {
                path.moveTo(x, y);
            } else {
                path.lineTo(x, y);
            }
        }
        path.close();
        canvas.drawPath(path, borderStrokePaint);

        for (int i = 0; i < corners.length(); i++) {
            JSONObject corner = corners.optJSONObject(i);
            if (corner == null) {
                continue;
            }
            float x = (float) corner.optDouble("x", 0) * width;
            float y = (float) corner.optDouble("y", 0) * height;
            canvas.drawCircle(x, y, 10f, borderDotPaint);
        }
    }
}
