import React from 'react';
import './App.css'
import Card from '@mui/material/Card';
import { Box, CardContent, Checkbox, FormControlLabel, FormGroup, MenuItem, Select, Stack } from '@mui/material';
import Typography from '@mui/material/Typography';
import { Button } from '@mui/material';
import { XyScatterRenderableSeries, XyDataSeries, SweepAnimation, EllipsePointMarker, DataPointSelectionPaletteProvider } from "scichart";
import { SciChartReact } from "scichart-react";
import { prepareChart } from './chartSetup';
import { useDebounce } from './useDebounce';
import { DataPointSelectionModifier } from "scichart/Charting/ChartModifiers/DataPointSelectionModifier";
import pv from 'bio-pv';

const SOURCES = [
  "afdb-clusters-dark",
  "afdb-clusters-light",
  "hclust30-clusters",
  "mip-clusters",
  "mip-singletons"
]

const X_START = 40;
const DJANGO_HOST = import.meta.env.VITE_DJANGO_HOST;

function Chart({ selectedType, selectionCallback }) {
  const rootElementId = "scichart-root";

  const sciChartSurfaceRef = React.useRef(null);
  const wasmContextRef = React.useRef(null);

  const [currentData, setCurrentData] = React.useState(undefined);
  const [visible, setVisible] = React.useState({
    x: { min: -20, max: 20 },
    y: { min: -30, max: 20 }
  });
  const [completedX, setCompletedX] = React.useState(false);
  const [completedY, setCompletedY] = React.useState(false);
  const [previousSelected, setPreviousSelected] = React.useState([]);
  const [zoomFactor, setZoomFactor] = React.useState(1);
  const queue = React.useRef([]);

  const initFunction = React.useCallback(prepareChart(), []);

  const zoomCallbackX = React.useCallback((zoomState) => {
    setVisible((prev) => ({
      ...prev,
      x: {
        min: zoomState.visibleRange.min,
        max: zoomState.visibleRange.max
      }
    }));
    setCompletedX(true);
  }, []);

  const zoomCallbackY = React.useCallback((zoomState) => {
    setVisible((prev) => ({
      ...prev,
      y: {
        min: zoomState.visibleRange.min,
        max: zoomState.visibleRange.max
      }
    }));
    setCompletedY(true);
  }, []);

  React.useEffect(() => {
    if ((!completedX || !completedY) && selectedType === previousSelected) return;

    const url = `${DJANGO_HOST}/points?x0=${visible.x.min}&x1=${visible.x.max}&y0=${visible.y.min}&y1=${visible.y.max}&types=${selectedType.join(",")}`;
    const currentZoomFactor = Math.max(Math.min((visible.x.max - visible.x.min) / X_START * 10, 1), 0.1);

    queue.current.push([url, currentZoomFactor]);
    setCompletedX(false);
    setCompletedY(false);
    setPreviousSelected(selectedType);

    // sciChartSurfaceRef.current?.chartModifiers.clear();
  }, [completedX, completedY, selectedType]);

  // Run every 300ms
  React.useEffect(() => {
    const interval = setInterval(() => {
      if (queue.current.length > 0) {
        const url = queue.current[queue.current.length - 1][0]
        fetch(url)
          .then(res => res.json())
          .then(data => {
            if (window.backgroundData === undefined) {
              window.backgroundData = [];
            }
            const concat = window.backgroundData.concat(data);
            setCurrentData(concat);
            window.currentData = concat;
          });
        setZoomFactor(queue.current[queue.current.length - 1][1]);
        queue.current = [];
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);


  function onSelectionChanged(data) {
    if (data.selectedDataPoints.length === 0) return;

    const idx = data.selectedDataPoints[0].metadataProperty.name;
    selectionCallback(window.currentData.filter((d) => d.name === idx)[0]);
  }

  React.useEffect(() => {
    fetch(`${DJANGO_HOST}/points_init`)
      .then(res => res.json())
      .then(data => {
        setCurrentData(data);
        window.backgroundData = data;
        window.currentData = data;
      });

    initFunction(rootElementId).
      then(({ sciChartSurface, wasmContext }) => {
        sciChartSurfaceRef.current = sciChartSurface;
        wasmContextRef.current = wasmContext;
        window.plot = sciChartSurface;
        window.wasmContext = wasmContext;

        const dataPointSelection = new DataPointSelectionModifier();
        dataPointSelection.selectionChanged.subscribe(onSelectionChanged);
        dataPointSelection.allowDragSelect = false;

        sciChartSurface.xAxes.get(0).visibleRangeChanged.subscribe(zoomCallbackX);
        sciChartSurface.yAxes.get(0).visibleRangeChanged.subscribe(zoomCallbackY);
        sciChartSurface.chartModifiers.add(dataPointSelection);
      });
  }, []);

  React.useEffect(() => {
    if (currentData && sciChartSurfaceRef.current) {
      // remove previous series
      sciChartSurfaceRef.current?.renderableSeries.clear();

      const colors = currentData.map((d) => d.type);

      const unique_colors = [...new Set(colors)];

      const colorMap = {
        "afdb-clusters-dark": "#1f77b4",
        "afdb-clusters-light": "#ff7f0e",
        "hclust30-clusters": "#2ca02c",
        "mip-clusters": "#d62728",
        "mip-singletons": "#9467bd",
      }

      // just a tad darker
      const strokeMap = {
        "afdb-clusters-dark": "#144c73",
        "afdb-clusters-light": "#b35e00",
        "hclust30-clusters": "#1e4d1e",
        "mip-clusters": "#a41f1f",
        "mip-singletons": "#6a4b8d",
      }

      for (let i = 0; i < unique_colors.length; i++) {
        if (!selectedType.includes(unique_colors[i]))
          continue;

        const color = unique_colors[i];
        const data = currentData.filter((d) => d.type === color);
        const xValues = data.map((d) => d.x);
        const yValues = data.map((d) => d.y);
        const metadata = data;
        const type = data[0].type;

        sciChartSurfaceRef.current.renderableSeries.add(
          new XyScatterRenderableSeries(wasmContextRef.current, {
            dataSeries: new XyDataSeries(wasmContextRef.current, { xValues, yValues, metadata }),
            opacity: Math.min(0.6 / zoomFactor, 1),
            animation: new SweepAnimation({ duration: 0, fadeEffect: true }),
            pointMarker: new EllipsePointMarker(wasmContextRef.current, {
              width: Math.min(8 / zoomFactor, 12),
              height: Math.min(8 / zoomFactor, 12),
              // strokeThickness: 3 / zoomFactor,
              fill: colorMap[color],
              stroke: strokeMap[color]
            }),
            metadata: { type },
            paletteProvider: new DataPointSelectionPaletteProvider({ stroke: "#ffffff", fill: "#ffffff" }),
          })
        )
      }
    }
  }, [currentData, selectedType]);

  return (<div id={rootElementId} style={{ width: "100%", height: "100vh" }} />);
}

function App() {
  const [data, setData] = React.useState(null);
  var [currentCluster, setCurrentCluster] = React.useState("Everything");
  const [selectedSources, setSelectedSources] = React.useState(SOURCES);

  function onClick(datum) {
    if (datum === null || datum === undefined) return;
    setData(datum);

    if (window.viewer === undefined) {
      var options = {
        width: 300,
        height: 300,
        antialias: true,
        quality: 'medium'
      };
      window.viewer = pv.Viewer(document.getElementById('viewer-dom'), options);
    }

    pv.io.fetchPdb(`${DJANGO_HOST}/pdb/${datum.pdb_loc}`, function (structure) {
      window.viewer.clear();
      window.viewer.cartoon('protein', structure);
      var ligands = structure.select({ rnames: ['SAH', 'RVP'] });
      window.viewer.ballsAndSticks('ligands', ligands);
      window.viewer.centerOn(structure);
      window.viewer.setZoom(100);
    });
  }

  function onHover(datum) {
    return datum.Cluster;
  }

  return (
    <>
      <Chart selectedType={selectedSources} selectionCallback={onClick} />
      <Card sx={{
        position: "absolute",
        overflow: "hidden",
        borderRadius: "10px",
        zIndex: 1,
        margin: "10px",
        padding: "10px",
        top: "10px",
      }}>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
          Selected protein
        </Typography>
        <Typography variant="h6" component="div">
          {
            data ? (
              <Stack direction="column">
                <Box>Name: {data.name}</Box>
                <Box>Type: {data.type}</Box>
              </Stack>
            ) : null
          }
        </Typography>
      </Card>

      {/* PDB Viewer */}
      <Card sx={{
        position: "absolute",
        overflow: "hidden",
        borderRadius: "10px",
        zIndex: 1,
        margin: "10px",
        padding: "10px",
        top: "10px",
        right: "10px",
      }}>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
          Protein Viewer
        </Typography>
        <div id="viewer-dom" style={{ width: "300px", height: "300px" }}></div>
      </Card>

      {/* Filters */}
      <Card sx={{
        position: "absolute",
        overflow: "hidden",
        borderRadius: "10px",
        zIndex: 1,
        margin: "10px",
        padding: "10px",
        bottom: "10px",
        right: "10px",
      }}>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
          Filter by
        </Typography>
        <CardContent>
          <Select
            value={"Origin"}
            onChange={(e) => {
              setCurrentCluster(e.target.value);
            }}
          >
            <MenuItem value={"Origin"}>Origin</MenuItem>
            <Box pl={1}>
              <FormGroup className='p-3'>
                {
                  SOURCES.map((source, i) => (
                    <FormControlLabel key={i} control={
                      <Checkbox
                        checked={selectedSources.includes(source)}
                      />
                    } label={source} value={source}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedSources([...selectedSources, source]);
                        } else {
                          setSelectedSources(selectedSources.filter((s) => s !== source));
                        }
                      }}
                    />
                  ))
                }
              </FormGroup>
            </Box>
          </Select>
        </CardContent>
      </Card>
    </>
  )
}

export default App
