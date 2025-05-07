import React from 'react';
import './App.css'
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Card from '@mui/material/Card';
import { Autocomplete, Box, CardContent, Checkbox, FormControlLabel, FormGroup, MenuItem, Select, Slider, Stack, TextField, Typography, Link, Fade, Switch, CircularProgress, Button } from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import LaunchIcon from '@mui/icons-material/Launch';
import { XyScatterRenderableSeries, XyDataSeries, SweepAnimation, EllipsePointMarker, DataPointSelectionPaletteProvider, GenericAnimation, easing, NumberRangeAnimator, NumberRange, Logger } from "scichart";
import { SciChartReact } from "scichart-react";
import { prepareChart } from './chartSetup';
import { useDebounce } from './useDebounce';
import { DataPointSelectionModifier } from "scichart/Charting/ChartModifiers/DataPointSelectionModifier";
import pv from 'bio-pv';
import useWebSocket from 'react-use-websocket';
import { useCallback } from 'react';
import { debounce } from 'lodash';

const SOURCES = [
  "AFDB light clusters",
  "AFDB dark clusters",
  "ESMAtlas clusters",
  "MIP clusters",
  "MIP singletons"
]

const SOURCE_MAPPING = {
  "MIP clusters": "MIP clusters",
  "MIP singletons": "MIP singletons",
  "ESMAtlas clusters": "ESMAtlas clusters",
  "AFDB light clusters": "AFDB light clusters",
  "AFDB dark clusters": "AFDB dark clusters"
};

const ANNOTATION_MAPPING = {
  "general function": "general function",
  "unannotated": "unannotated",
  "superCOG 1": "superCOG 1",
  "superCOG 2": "superCOG 2",
  "superCOG 3": "superCOG 3",
  "superCOG 1+2": "superCOG 1+2",
  "superCOG 1+3": "superCOG 1+3",
  "superCOG 2+3": "superCOG 2+3",
}

const TAXONOMY_MAPPING = {
  "Bacteria": "Bacteria",
  "Environmental": "Environmental",
  "Plants and Fungi": "Plants and Fungi",
  "Invertebrates": "Invertebrates",
  "Engineered": "Engineered",
  "Host-associated": "Host-associated",
  "Unknown": "Unknown",
  "Vertebrates": "Vertebrates",
  "Mammals": "Mammals",
  "Primates": "Primates",
  "Rodents": "Rodents"
}

const SearchMode = {
  NAME: 'name',
  GOTERM: 'goterm'
};


const X_START = 40;
const DJANGO_HOST = import.meta.env.VITE_DJANGO_HOST;

// Create a custom theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4aa3ff',
    },
    secondary: {
      main: '#ff9999',
    },
    background: {
      default: '#1a1a1a',
      paper: '#2a2a2a',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h6: {
      fontWeight: 500,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          transition: 'box-shadow 0.3s ease-in-out',
          '&:hover': {
            boxShadow: '0 6px 12px rgba(0, 0, 0, 0.15)',
          },
        },
      },
    },
  },
});

function Chart({ selectedType, selectionCallback, lengthRange, pLDDT, supercog, foundItem, goTerm, aspect, setIsLoading, taxonomy }) {
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
  const [lengthRangeState, setlengthRangeState] = React.useState([0, 2700]);
  const [pLDDTState, setPLDDTState] = React.useState([20, 100]);
  const [zoomFactor, setZoomFactor] = React.useState(1);
  const [previousSupercog, setPreviousSupercog] = React.useState([]);
  const [previousFoundItem, setPreviousFoundItem] = React.useState(null);
  const [backgroundData, setBackgroundData] = React.useState([]);
  const [streamingData, setStreamingData] = React.useState([]);
  const [previousGoTerm, setPreviousGoTerm] = React.useState("");
  const [previousAspect, setPreviousAspect] = React.useState("");
  const [previousTaxonomy, setPreviousTaxonomy] = React.useState([]);

  const { sendMessage, lastMessage, readyState } = useWebSocket(`${window.location.protocol === 'https:' ? 'wss' : window.location.protocol === 'http:' ? 'ws' : 'ws'}://${DJANGO_HOST.replace("http://", "").replace("https://", "") || window.location.host}/ws/points`, {
    shouldReconnect: (closeEvent) => true,
    reconnectInterval: 3000,
    reconnectAttempts: 10,
    share: false,
  });

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

  const debouncedSendMessage = useCallback(
    debounce((message) => {
      sendMessage(message);
      setIsLoading(true);
    }, 100),
    [sendMessage]
  );

  React.useEffect(() => {
    if ((!completedX || !completedY) &&
      selectedType === previousSelected &&
      lengthRangeState[0] === lengthRange[0] && lengthRangeState[1] === lengthRange[1] &&
      pLDDTState[0] === pLDDT[0] && pLDDTState[1] === pLDDT[1] &&
      supercog === previousSupercog &&
      goTerm === previousGoTerm &&
      aspect === previousAspect &&
      taxonomy === previousTaxonomy
    ) return;

    const message = {
      x0: visible.x.min,
      x1: visible.x.max,
      y0: visible.y.min,
      y1: visible.y.max,
      types: selectedType,
      lengthRange: lengthRange,
      pLDDT: pLDDT,
      supercog: supercog,
      goTerm: goTerm,
      ontology: aspect,
      taxonomy: taxonomy
    };

    debouncedSendMessage(JSON.stringify(message));

    setCompletedX(false);
    setCompletedY(false);
    setPreviousSelected(selectedType);
    setlengthRangeState(lengthRange);
    setPLDDTState(pLDDT);
    setPreviousSupercog(supercog);
    setPreviousGoTerm(goTerm);
    setPreviousAspect(aspect);
    setPreviousTaxonomy(taxonomy);
  }, [completedX, completedY, selectedType, lengthRange, pLDDT, supercog, goTerm, aspect, visible, debouncedSendMessage, taxonomy]);

  // Add this new effect to force a view update when GO term filters change
  React.useEffect(() => {
    if (sciChartSurfaceRef.current && (goTerm !== previousGoTerm || aspect !== previousAspect || taxonomy !== previousTaxonomy)) {
      // Force a view update by slightly adjusting the visible range
      const xAxis = sciChartSurfaceRef.current.xAxes.get(0);
      const yAxis = sciChartSurfaceRef.current.yAxes.get(0);

      if (xAxis && yAxis) {
        // Store current ranges
        const currentXRange = xAxis.visibleRange;
        const currentYRange = yAxis.visibleRange;

        // Trigger a small change to force update
        setTimeout(() => {
          // Apply a tiny offset to force redraw
          const xOffset = (currentXRange.max - currentXRange.min) * 0.001;
          const yOffset = (currentYRange.max - currentYRange.min) * 0.001;

          // Set new ranges with tiny offsets
          xAxis.visibleRange = new NumberRange(
            currentXRange.min - xOffset,
            currentXRange.max + xOffset
          );

          yAxis.visibleRange = new NumberRange(
            currentYRange.min - yOffset,
            currentYRange.max + yOffset
          );

          // This will trigger the zoom callbacks which will request new data
        }, 100);
      }
    }
  }, [goTerm, aspect, previousGoTerm, previousAspect, taxonomy, previousTaxonomy]);

  React.useEffect(() => {
    return () => {
      debouncedSendMessage.cancel();
    };
  }, [debouncedSendMessage]);

  React.useEffect(() => {
    if (lastMessage) {
      setIsLoading(false);
      try {
        const data = JSON.parse(lastMessage.data);
        switch (data.type) {
          case 'init':
            // Set permanent background data
            setBackgroundData(data.points);
            window.backgroundData = data.points;
            break;

          case 'update':
            if (data.is_last) {
              // Last batch - update the streaming data
              setStreamingData(prev => [...prev, ...data.points]);
            } else {
              // Accumulate streaming data
              setStreamingData(prev => [...prev, ...data.points]);
            }
            break;

          case 'error':
            console.error('Server error:', data.message);
            break;
        }

        // Combine background and streaming data for rendering
        let combinedData;
        if (!goTerm && !aspect)
          combinedData = [...backgroundData, ...streamingData];
        else
          combinedData = streamingData;

        setCurrentData(combinedData);
        window.currentData = combinedData;

      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage, backgroundData]);

  // Clear streaming data when query parameters change
  React.useEffect(() => {
    setStreamingData([]);
  }, [selectedType, lengthRange, pLDDT, supercog, goTerm, aspect, taxonomy]);

  function onSelectionChanged(data) {
    if (data.selectedDataPoints.length === 0) return;

    // Add error handling for missing metadata
    // Iterate through all selected data points
    for (const selectedPoint of data.selectedDataPoints) {
      console.log(selectedPoint.metadataProperty);
      if (!selectedPoint.metadataProperty) {
        console.warn("Selected point is missing metadata");
        continue;
      }

      if (!selectedPoint.metadataProperty.active) {
        console.warn("Selected point is not active");
        continue;
      }

      const idx = selectedPoint.metadataProperty.name;
      if (!idx) {
        console.warn("Selected point metadata is missing name property");
        continue;
      }

      const matchingData = window.currentData.filter((d) => d.protein === idx);
      if (matchingData.length === 0) {
        console.warn(`No data found with name: ${idx}`);
        continue;
      }

      // Return the first valid match found
      selectionCallback(matchingData[0]);
      return;
    }

    // If we get here, no valid points were found
    console.warn("No valid data points found in selection");
  }

  React.useEffect(() => {
    if (foundItem === previousFoundItem || !foundItem) return;

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

  React.useEffect(() => {
    console.log("init");
    sendMessage(JSON.stringify({ type: 'init' }));

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

      const grayedOutData = window.backgroundData;
      const xValuesGrayedOut = grayedOutData.map((d) => d.x);
      const yValuesGrayedOut = grayedOutData.map((d) => d.y);

      sciChartSurfaceRef.current.renderableSeries.add(
        new XyScatterRenderableSeries(wasmContextRef.current, {
          dataSeries: new XyDataSeries(wasmContextRef.current, {
            xValues: xValuesGrayedOut,
            yValues: yValuesGrayedOut,
            // Add metadata to background points as well
            metadata: grayedOutData.map(d => ({ name: d.protein, active: false }))
          }),
          opacity: 0.2,
          animation: new SweepAnimation({ duration: 0, fadeEffect: true }),
          pointMarker: new EllipsePointMarker(wasmContextRef.current, {
            width: Math.min(10 / zoomFactor, 16),
            height: Math.min(10 / zoomFactor, 16),
            fill: 'gray',
            stroke: 'gray'
          }),
        })
      )

      const colors = currentData.map((d) => d.origin);

      const unique_colors = [...new Set(colors)];

      const colorMap = {
        "AFDB dark clusters": "#4C5B5C",
        "AFDB light clusters": "#4aa3ff",
        "ESMAtlas clusters": "#2ca02c",
        "MIP clusters": "#d62728",
        "MIP singletons": "#ff9999"
      }

      // just a tad darker
      const strokeMap = {
        "AFDB dark clusters": "#3f8fcc",
        "AFDB light clusters": "#3f8fcc",
        "ESMAtlas clusters": "#1f7f1f",
        "MIP clusters": "#b71c1c",
        "MIP singletons": "#cc7f7f"
      }

      for (let i = 0; i < unique_colors.length; i++) {
        if (!selectedType.includes(unique_colors[i]))
          continue;
        const color = unique_colors[i];
        let data = currentData.filter((d) => d.origin === color);

        // Deduplicate data by name
        const uniqueNames = new Set();
        data = data.filter(d => {
          if (uniqueNames.has(d.protein)) {
            return false;
          }
          uniqueNames.add(d.protein);
          return true;
        });

        data = data.filter((d) => d.length >= lengthRange[0] && d.length <= lengthRange[1]);
        data = data.filter((d) => (d["afdb_pLDDT"] >= pLDDT[0] && d["afdb_pLDDT"] <= pLDDT[1]) || d["afdb_pLDDT"] === -1);
        data = data.filter((d) => supercog.includes(d["superCOG_v10"]));
        data = data.filter((d) => taxonomy.includes(d["taxonomy"]));
        const xValues = data.map((d) => d.x);
        const yValues = data.map((d) => d.y);

        // Simplify metadata to only include essential properties
        const metadata = data.map((d) => ({
          name: d.protein,
          isSelected: d.protein === foundItem?.protein,
          active: true
        }));

        sciChartSurfaceRef.current.renderableSeries.add(
          new XyScatterRenderableSeries(wasmContextRef.current, {
            dataSeries: new XyDataSeries(wasmContextRef.current, {
              xValues,
              yValues,
              metadata
            }),
            opacity: Math.min(0.6 / zoomFactor, 1),
            animation: new SweepAnimation({ duration: 0, fadeEffect: true }),
            pointMarker: new EllipsePointMarker(wasmContextRef.current, {
              width: Math.min(10 / zoomFactor, 16),
              height: Math.min(10 / zoomFactor, 16),
              // strokeThickness: 3 / zoomFactor,
              fill: colorMap[color],
              // stroke: strokeMap[color]
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
  const [lengthRange, setlengthRange] = React.useState([0, 2700]);
  const [pLDDT, setPLDDT] = React.useState([20, 100]);
  const [supercog, setSupercog] = React.useState(Object.keys(ANNOTATION_MAPPING));
  const [taxonomy, setTaxonomy] = React.useState(Object.keys(TAXONOMY_MAPPING));
  const [autocomplete, setAutocomplete] = React.useState([]);
  const [selectedItem, setSelectedItem] = React.useState(null);
  const [selectionMode, setSelectionMode] = React.useState(SearchMode.NAME);
  const [goTerm, setGoTerm] = React.useState("");
  const [aspect, setAspect] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [goTermDetails, setGoTermDetails] = React.useState(null);
  const [selectedGoTermValue, setSelectedGoTermValue] = React.useState(null);
  const [selectedNonRepresentative, setSelectedNonRepresentative] = React.useState(null);

  // Update this useEffect to fetch GO term details when a protein is selected
  const host = DJANGO_HOST;

  React.useEffect(() => {
    if (data && data.protein) {
      let name = data.protein.includes("-") ? data.protein.split("-")[1] : data.protein;
      if (selectedNonRepresentative) {
        name = selectedNonRepresentative;
      }

      // Use the protein name to fetch GO terms
      fetch(`${host}/goterm/${name}`)
        .then(res => res.json())
        .then(goData => {
          setGoTermDetails(goData);
        })
        .catch(err => {
          console.error("Error fetching GO term details:", err);
          setGoTermDetails(null);
        });
    } else {
      setGoTermDetails(null);
    }
  }, [data, selectedNonRepresentative]); // Now triggered when data changes

  function renderProtein(pdb_loc) {
    if (window.viewer === undefined) {
      const viewerInstance = new PDBeMolstarPlugin();
      window.viewer = viewerInstance;
    }

    window.viewer.render(document.getElementById('viewer-dom'), {
      customData: {
        url: `${DJANGO_HOST}/pdb/${pdb_loc}`,
        format: 'pdb',
      },
      bgColor: 'white',
      alphafoldView: true,
    })
  }

  function onClick(datum) {
    if (datum === null || datum === undefined) return;

    fetch(`${host}/name_search?name=${datum.protein}`)
      .then(res => res.json())
      .then(data => {
        datum.others = data[0].others[0];
        if (datum.protein == datum.clean_name)
          setSelectedNonRepresentative(null);
        else
          setSelectedNonRepresentative(datum.protein);
        setData(datum);
      })
      
      // renderProtein(datum.pdb_loc);
      fetch(`${host}/pdb_loc/${datum.protein}`)
        .then(res => res.json())
        .then(pdb_loc => {
          renderProtein(pdb_loc);
        });
  }


  let name = data?.representative;
  console.log(data);
  if (data?.origin.includes("AFDB"))
    if (name.match(/-/g)?.length > 1)
      name = name.split("-")[1];

  let currentGoTermProtein = data?.representative;
  if (selectedNonRepresentative) {
    currentGoTermProtein = selectedNonRepresentative;
  }

  let type = SOURCE_MAPPING[data?.origin];

  const nameSearchUrl = `${DJANGO_HOST}/name_search`;
  const goTermSearchUrl = `${DJANGO_HOST}/goterm_autocomplete`;

  console.log("Current goterm protein: ", currentGoTermProtein);
  console.log("Selected non representative: ", selectedNonRepresentative);

  return (
    <ThemeProvider theme={theme}>
      {isLoading && (
        <Box
          sx={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            padding: '20px',
            borderRadius: '50%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <CircularProgress sx={{ color: theme.palette.primary.main }} />
        </Box>
      )}
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh', color: 'text.primary' }}>
        <Chart
          selectedType={selectedSources}
          selectionCallback={onClick}
          lengthRange={lengthRange}
          pLDDT={pLDDT}
          supercog={supercog}
          foundItem={selectedItem}
          goTerm={goTerm}
          aspect={aspect}
          setIsLoading={setIsLoading}
          taxonomy={taxonomy}
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
          {/* Search Component */}
          <Fade in={true} timeout={800}>
            <Card sx={{
              overflow: "hidden",
              borderRadius: "10px",
              zIndex: 2,
              margin: "10px",
              padding: "10px",
              width: "fit-content",
            }}>
              {selectionMode === SearchMode.NAME && (
                <Autocomplete
                  disablePortal
                  id="name-select"
                  options={autocomplete}
                  sx={{ width: 400 }}
                  renderInput={(params) => <TextField {...params} label="Search by name" />}
                  getOptionLabel={(option) => option.protein}
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
              )}
              {selectionMode === SearchMode.GOTERM && (
                <Autocomplete
                  disablePortal
                  id="goterm-select"
                  options={autocomplete}
                  sx={{ width: 400 }}
                  value={selectedGoTermValue}
                  renderInput={(params) => <TextField {...params} label="Search by function" />}
                  getOptionLabel={(option) => option.GOname}
                  onChange={(e, value) => {
                    if (value) {
                      setGoTerm(value.GOterm);
                      setAspect(value.Ontology);
                      setSelectedGoTermValue(value);
                    } else {
                      setGoTerm("");
                      setAspect("");
                      setSelectedGoTermValue(null);
                    }
                  }}
                  onInputChange={(e, value) => {
                    fetch(`${goTermSearchUrl}?goterm=${value}`)
                      .then(res => res.json())
                      .then(data => {
                        setAutocomplete(data);
                      });
                  }}
                />
              )}
              <Stack direction="row" spacing={2} marginTop="6px" justifyContent={"end"}>
                <Typography variant="body2" alignContent={"center"} color={selectionMode === SearchMode.NAME ? "primary" : "text.secondary"}>
                  Name
                </Typography>
                <Switch
                  checked={selectionMode === SearchMode.GOTERM}
                  onChange={(e) => {
                    setSelectionMode(e.target.checked ? SearchMode.GOTERM : SearchMode.NAME);
                    setGoTerm("");
                    setAspect("");
                    setSelectedItem(null);
                  }}
                />
                <Typography variant="body2" alignContent={"center"} color={selectionMode === SearchMode.GOTERM ? "primary" : "text.secondary"}>
                  Function
                </Typography>
              </Stack>
            </Card>
          </Fade>

          {/* Info Box & Proteins in Cluster */}
          <Fade in={true} timeout={1000}>
            <Stack direction="column" spacing={2} sx={{ mb: 2 }}>
              {/* Row with Representative Protein and Proteins in Cluster cards */}
              <Stack direction="row" spacing={2} sx={{ mx: 1 }} style={{ width: "600px"}}>
                {/* Representative Protein Card */}
                <Card sx={{
                  overflow: "hidden",
                  borderRadius: "10px",
                  zIndex: 1,
                  padding: "10px",
                  width: "50%",
                }}>
                  <Typography variant="h6" gutterBottom>
                    Representative protein
                  </Typography>
                  <Typography variant="body2" component="div">
                    {
                      data ? (
                        <Stack direction="column" spacing={1}>
                          <Box>Name: {name}</Box>
                          <Box>Database: {type}</Box>
                          <Box sx={{ overflowX: "auto", whiteSpace: "nowrap" }}>Origin: {data.taxonomy_name}</Box>
                          <Box>Length: {data.length}</Box>
                          <Box>deepFRI v1.0: {ANNOTATION_MAPPING[data["superCOG_v10"]]}</Box>
                          <Box>deepFRI v1.1: {ANNOTATION_MAPPING[data["superCOG_v11"]]}</Box>
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<DownloadIcon />}
                            onClick={() => {
                              const nameToDownload = selectedNonRepresentative ? selectedNonRepresentative : name;
                              fetch(`${host}/pdb_loc/${nameToDownload}`)
                                .then(res => res.json())
                                .then(pdb_loc => {
                                  const url = `${DJANGO_HOST}/pdb/${pdb_loc}`;

                                  const fname = pdb_loc.split("/")[pdb_loc.split("/").length - 1];

                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.download = `${fname}.pdb`;
                                  document.body.appendChild(link);
                                  link.click();
                                  document.body.removeChild(link);
                                });
                            }}
                            sx={{ mt: 1 }}
                          >
                            Download PDB
                          </Button>
                        </Stack>
                      ) : "No protein selected"
                    }
                  </Typography>
                </Card>

                {/* Proteins in Cluster Card */}
                {data ? (
                  <Card sx={{
                    overflow: "hidden",
                    borderRadius: "10px",
                    zIndex: 1,
                    padding: "10px",
                    width: "50%"
                  }}>
                    <Typography variant="h6" gutterBottom>
                      Proteins in cluster
                    </Typography>
                    <Box sx={{
                      maxHeight: "150px",
                      overflowY: "scroll",
                    }}>
                      {data.others.map((protein) => {
                        console.log("Protein: ", protein);
                        return (
                          <Box
                            key={protein.name}
                            sx={{
                              cursor: 'pointer',
                              '&:hover': {
                                bgcolor: 'action.hover'
                              },
                              p: 0.5,
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}
                          >
                            <Box
                              onClick={() => {
                                setSelectedNonRepresentative(protein.name);

                                fetch(`${host}/pdb_loc/${protein.name}`)
                                  .then(res => res.json())
                                  .then(pdb_loc => {
                                    renderProtein(pdb_loc);
                                  });
                              }}
                            >
                              {protein.name}
                            </Box>
                            <Link
                              href={protein.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              sx={{
                                color: 'text.secondary',
                                ml: 1,
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              <LaunchIcon fontSize="small" />
                            </Link>
                          </Box>
                        )
                      })}
                    </Box>
                  </Card>
                ) : <Box sx={{ width: "50%" }}></Box>}
              </Stack>

              {/* GO Term Details Card */}
              {goTermDetails && (
                <Card sx={{
                  overflow: "auto",
                  borderRadius: "10px",
                  zIndex: 1,
                  margin: "10px",
                  padding: "10px",
                  width: "400px",
                  maxHeight: "300px"
                }}>
                  <Typography variant="h6" gutterBottom>
                    Function predictions ({currentGoTermProtein})
                  </Typography>
                  <Box sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    mt: 2
                  }}>
                    {goTermDetails.map((term, index) => (
                      <Box
                        key={index}
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'background.paper',
                          border: '1px solid',
                          borderColor: 'divider',
                          '&:hover': {
                            bgcolor: 'action.hover',
                            cursor: 'pointer'
                          }
                        }}
                        onClick={() => {
                          const selectedTermObj = {
                            GOterm: term.go_id,
                            GOname: term.name,
                            Ontology: term.ontology
                          };
                          setGoTerm(term.go_id);
                          setAspect(term.ontology);
                          setSelectionMode(SearchMode.GOTERM);
                          setSelectedGoTermValue(selectedTermObj);
                        }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" fontWeight="medium">
                            {term.name} ({term.go_id})
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              bgcolor: term.ontology === 'MF' ? 'primary.main' :
                                term.ontology === 'BP' ? 'secondary.main' : 'success.main',
                              color: 'white',
                              px: 1,
                              py: 0.2,
                              borderRadius: 1,
                              fontSize: '0.7rem',
                              fontWeight: 'bold'
                            }}
                          >
                            {term.ontology}
                          </Typography>
                        </Stack>
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            Score:
                          </Typography>
                          <Box sx={{
                            width: '100%',
                            height: 4,
                            bgcolor: 'background.default',
                            mt: 0.5,
                            position: 'relative',
                            borderRadius: 1
                          }}>
                            <Box sx={{
                              position: 'absolute',
                              height: '100%',
                              width: `${term.score * 100}%`,
                              bgcolor: term.score > 0.7 ? 'success.main' :
                                term.score > 0.4 ? 'warning.main' : 'error.main',
                              borderRadius: 1
                            }} />
                          </Box>
                          <Typography variant="caption" sx={{ float: 'right', mt: 0.5 }}>
                            {term.score.toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                </Card>
              )}
            </Stack>
          </Fade>
        </Stack>

        {/* PDB Viewer */}
        <Fade in={true} timeout={1200}>
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
        </Fade>

        {/* Filters */}
        <Stack direction="column" spacing={1} sx={{
          position: "absolute",
          bottom: "10px",
          right: "16px",
          overflow: "hidden",
          margin: "0",
          justifyContent: "end",
          maxWidth: "450px",
          pointerEvents: "none"
        }}
        >
          <Fade in={true} timeout={1600}>
            <Card sx={{
              margin: "0",
              padding: "16px",
              overflow: "hidden",
              borderRadius: "10px",
              zIndex: 1,
              pointerEvents: "all"
            }}>
              <Typography variant="subtitle1" gutterBottom sx={{ mb: 1.5, px: 1 }}>
                Filters
              </Typography>
              
              <Stack direction="column" spacing={2.5}>
                {/* AFDB pLDDT and Length Sliders */}
                <Stack direction="row" spacing={3} sx={{ px: 1 }}>
                  <Box sx={{ width: "50%" }}>
                    <Typography variant="body2" gutterBottom sx={{ mb: 1 }}>AFDB pLDDT</Typography>
                    <Slider
                      defaultValue={[20, 100]}
                      value={pLDDT}
                      min={20}
                      max={100}
                      valueLabelDisplay="auto"
                      aria-labelledby="plddt-range-slider"
                      getAriaValueText={(value) => value}
                      onChange={(e, value) => {
                        setPLDDT(value);
                      }}
                      size="small"
                      marks={[
                        { value: 20, label: '20' },
                        { value: 100, label: '100' }
                      ]}
                    />
                  </Box>
                  
                  <Box sx={{ width: "50%" }}>
                    <Typography variant="body2" gutterBottom sx={{ mb: 1 }}>Length</Typography>
                    <Slider
                      defaultValue={[0, 2700]}
                      value={lengthRange}
                      min={0}
                      max={2700}
                      valueLabelDisplay="auto"
                      aria-labelledby="length-range-slider"
                      getAriaValueText={(value) => value}
                      onChange={(e, value) => {
                        setlengthRange(value);
                      }}
                      size="small"
                      marks={[
                        { value: 0, label: '0' },
                        { value: 2700, label: '2700' }
                      ]}
                    />
                  </Box>
                </Stack>
                
                {/* Dropdown Filters */}
                <Stack direction="row" spacing={2} sx={{ mt: 1, px: 1 }}>
                  {/* Taxonomy Filter */}
                  <Box sx={{ width: "33.3%" }}>
                    <Typography variant="body2" gutterBottom sx={{ mb: 1 }}>Taxonomy</Typography>
                    <Select
                      value={"taxonomy"}
                      onChange={(e) => {
                        setTaxonomy(e.target.value);
                      }}
                      size="small"
                      fullWidth
                      sx={{ fontSize: '0.875rem' }}
                    >
                      <MenuItem value={"taxonomy"}>Taxonomy</MenuItem>
                      <Box pl={1} sx={{ maxHeight: '200px', overflow: 'auto' }}>
                        <FormGroup sx={{ p: 1.5 }}>
                          {
                            Object.keys(TAXONOMY_MAPPING).map((tax, i) => (
                              <FormControlLabel key={i} control={
                                <Checkbox
                                  checked={taxonomy.includes(tax)}
                                  size="small"
                                />
                              } label={<Typography variant="body2">{TAXONOMY_MAPPING[tax]}</Typography>}
                                value={tax}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTaxonomy([...taxonomy, tax]);
                                  } else {
                                    setTaxonomy(taxonomy.filter((t) => t !== tax));
                                  }
                                }}
                              />
                            ))
                          }
                        </FormGroup>
                      </Box>
                    </Select>
                  </Box>
                  
                  {/* superCOG Filter */}
                  <Box sx={{ width: "33.3%" }}>
                    <Typography variant="body2" gutterBottom sx={{ mb: 1 }}>superCOG</Typography>
                    <Select
                      value={"superCOG"}
                      onChange={(e) => {
                        setCurrentCluster(e.target.value);
                      }}
                      size="small"
                      fullWidth
                      sx={{ fontSize: '0.875rem' }}
                    >
                      <MenuItem value={"superCOG"}>superCOG</MenuItem>
                      <Box pl={1} sx={{ maxHeight: '200px', overflow: 'auto' }}>
                        <FormGroup sx={{ p: 1.5 }}>
                          {
                            Object.keys(ANNOTATION_MAPPING).map((scog, i) => (
                              <FormControlLabel key={i} control={
                                <Checkbox
                                  checked={supercog.includes(scog)}
                                  size="small"
                                />
                              } label={<Typography variant="body2">{ANNOTATION_MAPPING[scog]}</Typography>}
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
                  </Box>
                  
                  {/* Database Filter */}
                  <Box sx={{ width: "33.3%" }}>
                    <Typography variant="body2" gutterBottom sx={{ mb: 1 }}>Database</Typography>
                    <Select
                      value={"Origin"}
                      onChange={(e) => {
                        setCurrentCluster(e.target.value);
                      }}
                      size="small"
                      fullWidth
                      sx={{ fontSize: '0.875rem' }}
                    >
                      <MenuItem value={"Origin"}>Database</MenuItem>
                      <Box pl={1} sx={{ maxHeight: '200px', overflow: 'auto' }}>
                        <FormGroup sx={{ p: 1.5 }}>
                          {
                            SOURCES.map((source, i) => (
                              <FormControlLabel key={i} control={
                                <Checkbox
                                  checked={selectedSources.includes(source)}
                                  size="small"
                                />
                              } label={<Typography variant="body2">{SOURCE_MAPPING[source]}</Typography>}
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
                  </Box>
                </Stack>
              </Stack>
            </Card>
          </Fade>
        </Stack>

        {/* GitHub Repository Link - Small Card */}
        <Fade in={true} timeout={1400}>
          <Card sx={{
            position: "fixed",
            bottom: "60px",
            left: "10px",
            overflow: "hidden",
            borderRadius: "10px",
            zIndex: 10,
            padding: "8px 12px",
            display: "flex",
            alignItems: "center",
            boxShadow: 3
          }}>
            <Link
              href="https://github.com/Tomasz-Lab/protein-structure-landscape"
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                display: "flex",
                alignItems: "center",
                textDecoration: "none",
                color: "text.primary"
              }}
            >
              <svg height="20" width="20" viewBox="0 0 16 16" style={{ marginRight: "8px" }}>
                <path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
              </svg>
              <Typography variant="body2" fontWeight="medium">GitHub Repository</Typography>
            </Link>
          </Card>
        </Fade>
      </Box >
    </ThemeProvider >
  )
}

export default App