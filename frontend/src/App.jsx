import React from 'react';
import './App.css'
import Card from '@mui/material/Card';
import { Autocomplete, Box, CardContent, Checkbox, FormControlLabel, FormGroup, MenuItem, Select, Slider, Stack, TextField } from '@mui/material';
import Typography from '@mui/material/Typography';
import { XyScatterRenderableSeries, XyDataSeries, SweepAnimation, EllipsePointMarker, DataPointSelectionPaletteProvider, GenericAnimation, easing, NumberRangeAnimator, NumberRange, LegendModifier } from "scichart";
import { prepareChart } from './chartSetup';
import { DataPointSelectionModifier } from "scichart/Charting/ChartModifiers/DataPointSelectionModifier";

const SOURCES = [
  "afdb-clusters-dark",
  "afdb-clusters-light",
  "hclust30-clusters",
  "mip-clusters",
  "mip-singletons"
]

const X_START = 40;
const DJANGO_HOST = import.meta.env.VITE_DJANGO_HOST;
const EXP_FACTOR = 2.0;

function Chart({ selectedType, selectionCallback, lengthRange, languages, foundItem }) {
  const rootElementId = "scichart-root";

  const sciChartSurfaceRef = React.useRef(null);
  const wasmContextRef = React.useRef(null);

  const [currentData, setCurrentData] = React.useState(undefined);
  const [visible, setVisible] = React.useState({
    x: { min: -40, max: 60 },
    y: { min: -40, max: 40 }
  });
  const [completedX, setCompletedX] = React.useState(false);
  const [completedY, setCompletedY] = React.useState(false);
  const [previousSelected, setPreviousSelected] = React.useState([]);
  const [lengthRangeState, setLengthRangeState] = React.useState([0, 2700]);
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
      languages === previousSupercog
    ) return;

    const url = `${DJANGO_HOST}/points?x0=${visible.x.min}&x1=${visible.x.max}&y0=${visible.y.min}&y1=${visible.y.max}&languages=${languages.join(",")}&length=${lengthRange.join(",")}`;

    const currentZoomFactor = Math.max(Math.min((visible.x.max - visible.x.min) / X_START * 10, 1), 0.1);

    queue.current.push([url, currentZoomFactor]);
    setCompletedX(false);
    setCompletedY(false);
    setPreviousSelected(selectedType);
    setLengthRangeState(lengthRange);
    setPreviousSupercog(languages);

    // sciChartSurfaceRef.current?.chartModifiers.clear();
  }, [completedX, completedY, selectedType, lengthRange]);

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
        minX: x - 1,
        maxX: x + 1,
        minY: y - 1,
        maxY: y + 1
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

    const idx = data.selectedDataPoints[0].metadataProperty.text;
    selectionCallback(window.currentData.filter((d) => d.text === idx)[0]);
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

      const colors = currentData.map((d) => d.lang_color);

      const unique_colors = [...new Set(colors)];

      for (let i = 0; i < unique_colors.length; i++) {

        let data = currentData.filter((d) => d.lang_color === unique_colors[i]);
        data = data.filter((d) => languages.includes(d.lang));
        data = data.filter((d) => d.length>=lengthRange[0]);
        data = data.filter((d) => d.length<=lengthRange[1]);

        const xValues = data.map((d) => d.x);
        const yValues = data.map((d) => d.y);
        const metadata = data.map((d) => { return { ...d, "isSelected": d.text === foundItem?.text } });
        console.log(data);

        sciChartSurfaceRef.current.renderableSeries.add(
          new XyScatterRenderableSeries(wasmContextRef.current, {
            dataSeries: new XyDataSeries(wasmContextRef.current, { xValues, yValues, metadata }),
            opacity: Math.min(0.6 / zoomFactor, 1),
            animation: new SweepAnimation({ duration: 0, fadeEffect: true }),
            pointMarker: new EllipsePointMarker(wasmContextRef.current, {
              width: Math.min(8 / zoomFactor, 12),
              height: Math.min(8 / zoomFactor, 12),
              // strokeThickness: 3 / zoomFactor,
              fill: unique_colors[i],
              stroke: unique_colors[i]
            }),
            paletteProvider: new DataPointSelectionPaletteProvider({ stroke: "#ffffff", fill: "#ffffff" }),
          })
        )
      }
    }
  }, [currentData, selectedType, foundItem, languages]);

  return (<div id={rootElementId} style={{ width: "100%", height: "100vh" }} />);
}

function App() {

  const [data, setData] = React.useState(null);
  const [availableLanguages, setAvailableLanguages] = React.useState([]);
  const [languages, setLanguages] = React.useState([]);
  const [selectedSources, setSelectedSources] = React.useState(SOURCES);
  const [availableLengths, setAvailableLengths] = React.useState([0, 0]);
  const [lengthRange, setLengthRange] = React.useState([0, 0]);
  const [autocomplete, setAutocomplete] = React.useState([]);
  const [selectedItem, setSelectedItem] = React.useState(null);

  function onClick(datum) {
    if (datum === null || datum === undefined) return;
    setData(datum);
  }

  React.useEffect(() => {
    fetch(`${DJANGO_HOST}/languages`)
      .then((data) => data.json())
      .then((data) => {
        setAvailableLanguages(data); 
        setLanguages(data.map((i) => i[0]))
      });

    fetch(`${DJANGO_HOST}/lengths`)
      .then((data) => data.json())
      .then((data) => {
        setAvailableLengths([data[0], Math.log(data[1])/Math.log(EXP_FACTOR)+1])
        setLengthRange([data[0], Math.log(data[1])/Math.log(EXP_FACTOR)+1])
      });
  }, [])

  let text = data?.text;

  const nameSearchUrl = `${DJANGO_HOST}/text_search`;

  return (
    <>
      <Chart
        selectedType={selectedSources}
        selectionCallback={onClick}
        lengthRange={[EXP_FACTOR**lengthRange[0], EXP_FACTOR**lengthRange[1]]}
        languages={languages}
        foundItem={selectedItem}
      />
      <Stack direction="column" spacing={2} sx={{
        position: "absolute",
        top: "10px",
        left: "16px",
        overflow: "hidden",
        margin: "0",
        justifyContent: "start",
        width: "50%",
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
            isOptionEqualToValue={(option, value) => option.text === value.text}
            renderInput={(params) => <TextField {...params} label="Search by text" />}
            getOptionLabel={(option) => option.text}
            onChange={(e, value) => {
              if (value) {
                setSelectedItem(value);
                onClick(value);
              }
            }}
            onInputChange={(e, value) => {
              fetch(`${nameSearchUrl}?text=${value}`)
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
            Selected quote
          </Typography>
          <Typography variant="h6" component="div">
            {
              data ? (
                <Stack direction="column">
                  <Box>{text}</Box>
                  <Box>Language: {data.lang}</Box>
                </Stack>
              ) : null
            }
          </Typography>
        </Card>
      </Stack>
      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{
        position: "absolute",
        bottom: "10px",
        right: "16px",
        overflow: "hidden",
        margin: "0",
        justifyContent: "end",
        width: "calc(100% - 16px)",
      }}
      >
        <Card sx={{
          margin: "10px",
          padding: "10px",
          overflow: "hidden",
          borderRadius: "10px",
          zIndex: 1,
          width: "25%",
          height: "fit-content",
          alignSelf: "flex-end",
        }}>
          <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
            Filter by number of words
          </Typography>
          <CardContent sx={{
            paddingBottom: "0px !important",
          }}>
            <Slider
              defaultValue={lengthRange}
              value={lengthRange}
              min={0}
              max={parseInt(availableLengths[1])}
              step={0.25}
              scale={(x) => EXP_FACTOR**x}
              valueLabelFormat={(d) => parseInt(d)}
              valueLabelDisplay="auto"
              aria-labelledby="range-slider"
              getAriaValueText={(value) => value}
              onChange={(e, value) => {
                setLengthRange(value);
              }}
              marks={[
                { value: 0, label: '0' },
                { value: availableLengths[1], label: availableLengths[1] }
              ]}
            />
          </CardContent>
        </Card>
        <Stack direction="column" spacing={2}>
          <Card sx={{
            margin: "16px",
            padding: "10px",
            overflow: "hidden",
            borderRadius: "10px",
            zIndex: 1,
          }}>
            <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
              Filter by language
            </Typography>
            <CardContent>
              <Select
                value={"Language"}
              >
                <MenuItem value={"Language"}>Language</MenuItem>
                <Box pl={1}>
                  <FormGroup className='p-3'>
                    {
                      availableLanguages.map((source, i) => (
                        <FormControlLabel key={i} control={
                          <Checkbox
                            checked={languages.includes(source[0])}
                            sx={{
                              color: source[1],
                              '&.Mui-checked': {
                                color: source[1],
                              },
                            }}
                          />
                        } label={source[0]}
                          value={source[0]}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setLanguages([...languages, source[0]]);
                            } else {
                              setLanguages(languages.filter((s) => s !== source[0]));
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
    </>
  )
}

export default App
