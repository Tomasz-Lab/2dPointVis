import React from 'react';
import './App.css'
import Card from '@mui/material/Card';
import { Autocomplete, Box, CardContent, Checkbox, FormControlLabel, FormGroup, MenuItem, Select, Slider, Stack, TextField, Typography, Link } from '@mui/material';
import { Button } from '@mui/material';
import { XyScatterRenderableSeries, XyDataSeries, SweepAnimation, EllipsePointMarker, DataPointSelectionPaletteProvider, GenericAnimation, easing, NumberRangeAnimator, NumberRange } from "scichart";
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

const SOURCE_MAPPING = {
  "mip-clusters": "MIP clusters",
  "mip-singletons": "MIP singletons",
  "hclust30-clusters": "ESMAtlas clusters",
  "afdb-clusters-light": "AFDB light clusters",
  "afdb-clusters-dark": "AFDB dark clusters"
};

const ANNOTATION_MAPPING = {
  "R": "general function",
  "unannotated": "unannotated",
  "s1": "superCOG 1",
  "s2": "superCOG 2",
  "s3": "superCOG 3",
  "s12": "superCOG 1+2",
  "s13": "superCOG 1+3",
  "s23": "superCOG 2+3",
}

const X_START = 40;
const DJANGO_HOST = import.meta.env.VITE_DJANGO_HOST;

function Chart({ selectedType, selectionCallback, lengthRange, pLDDT, supercog, foundItem }) {
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
  const [lengthRangeState, setLengthRangeState] = React.useState([0, 2700]);
  const [pLDDTState, setPLDDTState] = React.useState([20, 100]);
  const [zoomFactor, setZoomFactor] = React.useState(1);
  const [previousSupercog, setPreviousSupercog] = React.useState([]);
  const [previousFoundItem, setPreviousFoundItem] = React.useState(null);
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
    if ((!completedX || !completedY) &&
      selectedType === previousSelected &&
      lengthRangeState[0] === lengthRange[0] && lengthRangeState[1] === lengthRange[1] &&
      pLDDTState[0] === pLDDT[0] && pLDDTState[1] === pLDDT[1] &&
      supercog === previousSupercog
    ) return;

    const url = `${DJANGO_HOST}/points?x0=${visible.x.min}&x1=${visible.x.max}&y0=${visible.y.min}&y1=${visible.y.max}&types=${selectedType.join(",")}&lengthRange=${lengthRange.join(",")}&pLDDT=${pLDDT.join(",")}&supercog=${supercog.join(",")}`;
    const currentZoomFactor = Math.max(Math.min((visible.x.max - visible.x.min) / X_START * 10, 1), 0.1);

    queue.current.push([url, currentZoomFactor]);
    setCompletedX(false);
    setCompletedY(false);
    setPreviousSelected(selectedType);
    setLengthRangeState(lengthRange);
    setPLDDTState(pLDDT);
    setPreviousSupercog(supercog);

    // sciChartSurfaceRef.current?.chartModifiers.clear();
  }, [completedX, completedY, selectedType, lengthRange, pLDDT, supercog]);

  React.useEffect(() => {
    if (foundItem === previousFoundItem) return;

    // set x, y to the center of the protein
    const x = foundItem.x;
    const y = foundItem.y;

    const xAxisOld = sciChartSurfaceRef.current.xAxes.get(0);
    const yAxisOld = sciChartSurfaceRef.current.yAxes.get(0);

    const animation = new GenericAnimation({
      from: {
        minX: xAxisOld.visibleRange.min,
        maxX: xAxisOld.visibleRange.max,
        minY: yAxisOld.visibleRange.min,
        maxY: yAxisOld.visibleRange.max
      },
      to: {
        minX: x - 0.3,
        maxX: x + 0.3,
        minY: y - 0.3,
        maxY: y + 0.3
      },
      duration: 500,
      ease: easing.inOutSine,
      onAnimate: (from, to, progress) => {
        const xInterpolate = NumberRangeAnimator.interpolate(new NumberRange(from.minX, from.maxX), new NumberRange(to.minX, to.maxX), progress);
        const yInterpolate = NumberRangeAnimator.interpolate(new NumberRange(from.minY, from.maxY), new NumberRange(to.minY, to.maxY), progress);
        xAxisOld.visibleRange = new NumberRange(xInterpolate.min, xInterpolate.max);
        yAxisOld.visibleRange = new NumberRange(yInterpolate.min, yInterpolate.max);
      },
      onCompleted: () => {
        setPreviousFoundItem(foundItem);
        zoomCallbackX({ visibleRange: { min: x - 1, max: x + 1 } });
        zoomCallbackY({ visibleRange: { min: y - 1, max: y + 1 } });
      }
    });

    sciChartSurfaceRef.current.addAnimation(animation);
  }, [foundItem]);

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
        "afdb-clusters-dark": "#4C5B5C",
        "afdb-clusters-light": "#4aa3ff",
        "hclust30-clusters": "#2ca02c",
        "mip-clusters": "#d62728",
        "mip-singletons": "#ff9999"
      }

      // just a tad darker
      const strokeMap = {
        "afdb-clusters-dark": "#3f8fcc",
        "afdb-clusters-light": "#3f8fcc",
        "hclust30-clusters": "#1f7f1f",
        "mip-clusters": "#b71c1c",
        "mip-singletons": "#cc7f7f"
      }

      for (let i = 0; i < unique_colors.length; i++) {
        if (!selectedType.includes(unique_colors[i]))
          continue;

        const color = unique_colors[i];
        let data = currentData.filter((d) => d.type === color);
        data = data.filter((d) => d.Length >= lengthRange[0] && d.Length <= lengthRange[1]);
        data = data.filter((d) => (d["pLDDT (AF)"] >= pLDDT[0] && d["pLDDT (AF)"] <= pLDDT[1]) || d["pLDDT (AF)"] === -1);
        data = data.filter((d) => supercog.includes(d["SuperCOGs_str_v10"]));
        const xValues = data.map((d) => d.x);
        const yValues = data.map((d) => d.y);
        const metadata = data.map((d) => { return { ...d, "isSelected": d.name === foundItem?.name } });

        sciChartSurfaceRef.current.renderableSeries.add(
          new XyScatterRenderableSeries(wasmContextRef.current, {
            dataSeries: new XyDataSeries(wasmContextRef.current, { xValues, yValues, metadata }),
            opacity: Math.min(0.6 / zoomFactor, 1),
            animation: new SweepAnimation({ duration: 0, fadeEffect: true }),
            pointMarker: new EllipsePointMarker(wasmContextRef.current, {
              width: Math.min(10 / zoomFactor, 16),
              height: Math.min(10 / zoomFactor, 16),
              // strokeThickness: 3 / zoomFactor,
              fill: colorMap[color],
              stroke: strokeMap[color]
            }),
            paletteProvider: new DataPointSelectionPaletteProvider({ stroke: 'orange', fill: 'orange' }),
          })
        )
      }
    }
  }, [currentData, selectedType, foundItem]);

  return (<div id={rootElementId} style={{ width: "100%", height: "100vh" }} />);
}

function App() {
  const [data, setData] = React.useState(null);
  var [currentCluster, setCurrentCluster] = React.useState("Everything");
  const [selectedSources, setSelectedSources] = React.useState(SOURCES);
  const [lengthRange, setLengthRange] = React.useState([0, 2700]);
  const [pLDDT, setPLDDT] = React.useState([20, 100]);
  const [supercog, setSupercog] = React.useState(Object.keys(ANNOTATION_MAPPING));
  const [autocomplete, setAutocomplete] = React.useState([]);
  const [selectedItem, setSelectedItem] = React.useState(null);

  function onClick(datum) {
    if (datum === null || datum === undefined) return;
    setData(datum);

    if (window.viewer === undefined) {
      const viewerInstance = new PDBeMolstarPlugin();
      window.viewer = viewerInstance;
    }

    window.viewer.render(document.getElementById('viewer-dom'), {
      customData: {
        url: `${DJANGO_HOST}/pdb/${datum.pdb_loc}`,
        format: 'pdb',
      },
      bgColor: 'white',
      alphafoldView: true,
    })
  }


  let name = data?.name;
  if (data?.type.includes("afdb"))
    if (name.match(/-/g)?.length > 1)
      name = name.split("-")[1];

  let type = SOURCE_MAPPING[data?.type];

  const nameSearchUrl = `${DJANGO_HOST}/name_search`;

  return (
    <>
      <Chart
        selectedType={selectedSources}
        selectionCallback={onClick}
        lengthRange={lengthRange}
        pLDDT={pLDDT}
        supercog={supercog}
        foundItem={selectedItem}
      />
      <Stack direction="column" spacing={2} sx={{
        position: "absolute",
        top: "10px",
        left: "16px",
        overflow: "hidden",
        margin: "0",
        justifyContent: "start",
        width: "fit-content",
      }}>
        <Card sx={{
          overflow: "hidden",
          borderRadius: "10px",
          zIndex: 2,
          margin: "10px",
          padding: "10px",
          width: "fit-content",
        }}>
          <Autocomplete
            disablePortal
            id="name-select"
            options={autocomplete}
            sx={{ width: 400 }}
            renderInput={(params) => <TextField {...params} label="Search by name" />}
            getOptionLabel={(option) => option.name}
            onChange={(e, value) => {
              if (value) {
                setSelectedItem(value);
                onClick(value);
              }
            }}
            onInputChange={(e, value) => {
              fetch(`${nameSearchUrl}?name=${value}`)
                .then(res => res.json())
                .then(data => {
                  setAutocomplete(data);
                });
            }}
          />
        </Card>

        <Card sx={{
          overflow: "hidden",
          borderRadius: "10px",
          zIndex: 1,
          margin: "10px",
          padding: "10px",
          width: "fit-content",
        }}>
          <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
            Selected protein
          </Typography>
          <Typography variant="h6" component="div">
            {
              data ? (
                <Stack direction="column">
                  <Box>Name: {name}</Box>
                  <Box>Origin: {type}</Box>
                  <Box>Length: {data.Length}</Box>
                  <Box>deepFRI v1.0: {ANNOTATION_MAPPING[data["SuperCOGs_str_v10"]]}</Box>
                  <Box>deepFRI v1.1: {ANNOTATION_MAPPING[data["SuperCOGs_str_v11"]]}</Box>
                </Stack>
              ) : null
            }
          </Typography>
        </Card>
      </Stack>
      {/* PDB Viewer */}
      <Card sx={{
        position: "absolute",
        overflow: "hidden",
        borderRadius: "10px",
        zIndex: 1,
        margin: "10px",
        padding: "0px",
        top: "10px",
        right: "6px",
      }}>
        <div id="viewer-dom" style={{ width: "300px", height: "300px" }}></div>
      </Card>

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{
        position: "absolute",
        bottom: "10px",
        right: "16px",
        overflow: "hidden",
        margin: "0",
        justifyContent: "end",
        width: "50%",
        pointerEvents: "none"
      }}
      >
        <Card sx={{
          margin: "10px",
          padding: "10px",
          overflow: "hidden",
          borderRadius: "10px",
          zIndex: 1,
          width: "50%",
          height: "fit-content",
          alignSelf: "flex-end",
          pointerEvents: "all"
        }}>
          <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
            Filter by AFDB pLDDT
          </Typography>
          <CardContent sx={{
            paddingBottom: "0px !important",
          }}>
            <Slider
              defaultValue={[20, 100]}
              value={pLDDT}
              min={20}
              max={100}
              valueLabelDisplay="auto"
              aria-labelledby="range-slider"
              getAriaValueText={(value) => value}
              onChange={(e, value) => {
                setPLDDT(value);
              }}
              marks={[
                { value: 20, label: '20' },
                { value: 100, label: '100' }
              ]}
            />
          </CardContent>
        </Card>
        <Card sx={{
          margin: "10px",
          padding: "10px",
          overflow: "hidden",
          borderRadius: "10px",
          zIndex: 1,
          width: "50%",
          height: "fit-content",
          alignSelf: "flex-end",
          pointerEvents: "all"
        }}>
          <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
            Filter by length
          </Typography>
          <CardContent sx={{
            paddingBottom: "0px !important",
          }}>
            <Slider
              defaultValue={[0, 2700]}
              value={lengthRange}
              min={0}
              max={2700}
              valueLabelDisplay="auto"
              aria-labelledby="range-slider"
              getAriaValueText={(value) => value}
              onChange={(e, value) => {
                setLengthRange(value);
              }}
              marks={[
                { value: 0, label: '0' },
                { value: 2700, label: '2700' }
              ]}
            />
          </CardContent>
        </Card>
        <Stack direction="column">
          <Card sx={{
            margin: "16px",
            padding: "10px",
            overflow: "hidden",
            borderRadius: "10px",
            zIndex: 1,
            height: "fit-content",
            pointerEvents: "all"
          }}>
            <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
              Filter by superCOG
            </Typography>
            <CardContent>
              <Select
                value={"superCOG"}
                onChange={(e) => {
                  setCurrentCluster(e.target.value);
                }}
              >
                <MenuItem value={"superCOG"}>superCOG</MenuItem>
                <Box pl={1}>
                  <FormGroup className='p-3'>
                    {
                      Object.keys(ANNOTATION_MAPPING).map((scog, i) => (
                        <FormControlLabel key={i} control={
                          <Checkbox
                            checked={supercog.includes(scog)}
                          />
                        } label={ANNOTATION_MAPPING[scog]}
                          value={scog}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSupercog([...supercog, scog]);
                            } else {
                              setSupercog(supercog.filter((s) => s !== scog));
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
          <Card sx={{
            margin: "16px",
            padding: "10px",
            overflow: "hidden",
            borderRadius: "10px",
            zIndex: 1,
            pointerEvents: "all"
          }}>
            <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
              Filter by origin
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
                        } label={SOURCE_MAPPING[source]}
                          value={source}
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
        </Stack>
      </Stack>

      {/* New card for publication details and contact */}
      <Card sx={{
        position: "fixed",  // Changed from "absolute" to "fixed"
        bottom: "10px",
        left: "10px",
        overflow: "hidden",
        borderRadius: "10px",
        zIndex: 10,  // Increased z-index to ensure it's above other elements
        margin: "0",  // Removed margin
        padding: "10px",
        width: "300px",
        maxHeight: "200px",  // Added max height
        overflowY: "auto",  // Added vertical scroll if content exceeds max height
      }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Publication Details
          </Typography>
          <Typography variant="body2" gutterBottom>
            Szczerbiak, P., Szydlowski, L., Wydmański, W., Renfrew, P. D., Koehler Leman, J., & Kosciolek, T. (2024). Large protein databases reveal structural complementarity and functional locality.
          </Typography>
          <Link href="https://doi.org/10.1101/2024.08.14.607935" target="_blank" rel="noopener noreferrer">
            https://doi.org/10.1101/2024.08.14.607935
          </Link>
          <Stack direction="row" alignItems="center" spacing={1} mt={2}>
            <Typography variant="body2" fontWeight="bold">
              Email:
            </Typography>
            <Typography variant="body2">
              wwydmanski@gmail.com
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </>
  )
}

export default App