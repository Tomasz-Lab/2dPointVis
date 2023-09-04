import React from 'react';
import './App.css'
import Card from '@mui/material/Card';
import { CardContent } from '@mui/material';
import Typography from '@mui/material/Typography';

function App() {
  const [data, setData] = React.useState(null);

  function debug(datum) {
    console.log(datum);
    setData(datum.class);
  }

  React.useEffect(() => {
    window.plot.click_function = debug;

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
          Word of the Day
        </Typography>
        <Typography variant="h5" component="div">
          hello {data}
        </Typography>
      </Card>
    </>
  )
}

export default App
