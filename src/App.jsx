import React from 'react';
import './App.css'
import Card from '@mui/material/Card';
import { CardContent } from '@mui/material';
import Typography from '@mui/material/Typography';

function App() {
  const [data, setData] = React.useState(null);

  function onClick(datum) {
    console.log(datum);
    setData(datum.class);
  }

  function onHover(datum) {
    return datum.class
  }

  React.useEffect(() => {
    window.plot.click_function = onClick;
    window.plot.tooltip_html = onHover;

    return () => {
      window.plot.click_function = null;
    }
  }, []);

  return (
    <>
      <Card sx={{
        position: "absolute",
        overflow: "hidden",
        borderRadius: "10px",
        zIndex: 1,
        margin: "10px",
        padding: "10px",
      }}>
        <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
          Selected protein
        </Typography>
        <Typography variant="h5" component="div">
          {data}
        </Typography>
      </Card>
    </>
  )
}

export default App
