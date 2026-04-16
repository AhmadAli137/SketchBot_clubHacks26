package com.anonymous.sketchbotcamerabuddy;

import androidx.annotation.NonNull;

import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.uimanager.SimpleViewManager;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.uimanager.annotations.ReactProp;

@ReactModule(name = SketchbotMarkerOverlayManager.REACT_CLASS)
public class SketchbotMarkerOverlayManager extends SimpleViewManager<SketchbotMarkerOverlayView> {
    public static final String REACT_CLASS = "SketchbotMarkerOverlayView";

    @NonNull
    @Override
    public String getName() {
        return REACT_CLASS;
    }

    @NonNull
    @Override
    protected SketchbotMarkerOverlayView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new SketchbotMarkerOverlayView(reactContext);
    }

    @ReactProp(name = "overlayPayload")
    public void setOverlayPayload(SketchbotMarkerOverlayView view, String overlayPayload) {
        view.setOverlayPayload(overlayPayload);
    }
}
