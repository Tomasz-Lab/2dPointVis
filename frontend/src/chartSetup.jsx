import {
    EllipsePointMarker,
    MouseWheelZoomModifier,
    NumericAxis,
    NumberRange,
    SciChartSurface,
    SweepAnimation,
    TrianglePointMarker,
    XyDataSeries,
    XyScatterRenderableSeries,
    ZoomExtentsModifier,
    ZoomPanModifier,
} from "scichart";

const prepareChart = () => {
    SciChartSurface.configure({
        dataUrl: `https://cdn.jsdelivr.net/npm/scichart@3.5.687/_wasm/scichart2d.data`,
        wasmUrl: `https://cdn.jsdelivr.net/npm/scichart@3.5.687/_wasm/scichart2d.wasm`
    });
    SciChartSurface.UseCommunityLicense()

    const drawExample = async (rootElement) => {
        // Create a SciChartSurface
        const { sciChartSurface, wasmContext } = await SciChartSurface.create(rootElement);
        sciChartSurface.background = "#242424";
        // Create X,Y Axis
        sciChartSurface.xAxes.add(new NumericAxis(wasmContext, {
            visibleRange: new NumberRange(-30, 20),
            drawLabels: false,
            drawMajorBands: false,
            drawMajorGridLines: false,
            drawMinorGridLines: false,
            drawMinorTicks: false,
        }));
        sciChartSurface.yAxes.add(new NumericAxis(wasmContext, { 
            visibleRange: new NumberRange(-30, 20),
            drawLabels: false,
            drawMajorBands: false,
            drawMajorGridLines: false,
            drawMinorGridLines: false,
            drawMinorTicks: false,
        }));

        sciChartSurface.chartModifiers.add(new ZoomPanModifier());
        sciChartSurface.chartModifiers.add(new ZoomExtentsModifier());
        sciChartSurface.chartModifiers.add(new MouseWheelZoomModifier());

        // add aspect ratio setting
        return { sciChartSurface, wasmContext };
    };

    return drawExample;
}

export { prepareChart };