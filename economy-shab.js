// Set up
const DATA_URL = "https://raw.githubusercontent.com/statistikZH/economy_SHAB_private/master/Economy_SHAB_sectors.csv?token=ALJEHNU7G2IVAOWS66HAU3C7VQQME";

const dispatch = d3.dispatch("filter"); // Select options at top of chart
const colors = ["#a9dfff", "#009ee0", "#0076bd", "#e30059"];

// Process data
d3.csv(DATA_URL).then((csv) => {
  // Convert all date to 2020 so they can be plotted on the same x time axis
  const parseTime = d3.timeParse("%Y-%m-%d");
  const data = csv
    // .filter((d) => d.value > 0)
    .map((d) => ({
      value: +d.value, // Values to numeric
      date: d.date,
      year: d.date.slice(0, 4), // Extract year from date
      time: parseTime(`2020-${d.date.slice(5)}`), // Month-Day
      location: d.location,
      industry: d.mh_abschnitt,
    }));

  const locations = [
    "CH",
    ...Array.from(new Set(data.map((d) => d.location))).sort(),
  ];
  const industries = [
    "Alle Branchen",
    ...Array.from(new Set(data.map((d) => d.industry))).sort(),
  ];
  const years = Array.from(new Set(data.map((d) => d.year))).sort();

  const selected = {
    location: "ZH",
    industry: "Alle Branchen",
    years: years.slice(),
  };

  renderSelect({
    selection: d3.select("#location-select"),
    options: locations,
    selected: selected.location,
    dispatch,
    dimension: "location",
  });
  renderSelect({
    selection: d3.select("#industry-select"),
    options: industries,
    selected: selected.industry,
    dispatch,
    dimension: "industry",
  });
  renderLegendSelect({
    selection: d3.select("#year-select"),
    options: years,
    colors,
    dispatch,
    dimension: "years",
  });
  const chart = renderChart({
    selection: d3.select("#economy-shab-chart"),
    color: d3.scaleOrdinal().domain(years).range(colors),
  });

  dispatch.on("filter", ({ dimension, value }) => {
    selected[dimension] = value;
    const filtered = filter(data, selected);
    chart.update(filtered);
  });

  chart.update(data);
});

function filter(data, selected) {
  return data.filter((d) => {
    if (selected.location !== "CH" && d.location !== selected.location)
      return false;
    if (selected.industry !== "Alle Branchen" && d.industry !== selected.industry)
      return false;
    if (!selected.years.includes(d.year)) return false;
    return true;
  });
}

// Location/industry select
function renderSelect({ selection, options, selected, dispatch, dimension }) {
  selection
    .selectAll("option")
    .data(options)
    .join("option")
    .attr("value", (d) => d)
    .attr("selected", (d) => (d === selected ? "selected" : null))
    .text((d) => d);
  selection.on("change", function () {
    dispatch.call("filter", null, {
      dimension,
      value: this.value,
    });
  });
}

// Year select
function renderLegendSelect({
  selection,
  options,
  colors,
  dispatch,
  dimension,
}) {
  selection.classed("legend", true);
  let selected = new Set(options);
  const option = selection
    .selectAll(".legend-item")
    .data(d3.zip(options, colors).map((d) => ({ value: d[0], color: d[1] }))) // map colors to years
    .join("div")
    .attr("class", "legend-item")
    .on("click", toggle);
  option
    .append("div")
    .attr("class", "legend-swatch")
    .style("border-color", (d) => d.color)
    .style("background-color", (d) => d.color);
  option
    .append("div")
    .attr("class", "legend-value")
    .text((d) => d.value);

  function toggle(d) {
    if (selected.has(d.value)) {
      if (selected.size === 1) {
        selected = new Set(options);
      } else {
        selected.delete(d.value);
      }
    } else {
      selected.add(d.value);
    }

    option
      .select(".legend-swatch")
      .style("background-color", (d) =>
        selected.has(d.value) ? d.color : "#ffffff"
      );

    dispatch.call("filter", null, {
      dimension,
      value: options.filter((d) => selected.has(d)),
    });
  }
}

// Line chart
function renderChart({ selection, color }) {
  let svgWidth, svgHeight, width, height;
  let displayData;
  let delaunay, flatDisplayData, iFound;

  const margin = {
    top: 20,
    right: 10,
    bottom: 30,
    left: 50,
  };

  // Scales
  const x = d3
    .scaleTime()
    .domain([new Date(2020, 0, 1), new Date(2020, 11, 31)]);
  const y = d3.scaleLinear();

  // Line path generator
  const line = d3
    .line()
    .x((d) => x(d.time))
    .y((d) => y(d.total));

  // Container
  const svg = selection.append("svg");
  const g = svg
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
  const gLines = g.append("g").attr("class", "lines");
  const gXAxis = g.append("g").attr("class", "x axis");
  const xTitle = g
    .append("text")
    .text("Kumulierte Tageswerte")
    .attr("dy", "-6");
  const gYAxis = g.append("g").attr("class", "y axis");
  const gFocus = g.append("g").attr("class", "focus").style("display", "none");
  const focusHorizontalLine = gFocus.append("line").attr("class", "focus-line");
  const focusVerticalLine = gFocus.append("line").attr("class", "focus-line");
  const focusCircle = gFocus
    .append("circle")
    .attr("class", "focus-circle")
    .attr("r", 5);

  const tooltip = selection
    .append("div")
    .attr("class", "tooltip")
    .style("display", "none");

  window.addEventListener("resize", render);

  function render() {
    // Dimensions
    svgWidth = selection.node().clientWidth;
    svgHeight = 500;
    width = svgWidth - margin.left - margin.right;
    height = svgHeight - margin.top - margin.bottom;
    svg.attr("width", svgWidth).attr("height", svgHeight);

    // Scales
    x.range([0, width]);
    y.range([height, 0]).nice();

    // Render lines
    gLines
      .selectAll(".line")
      .data(displayData, (d) => d.key)
      .join("path")
      .attr("class", "line")
      .attr("stroke", (d) => color(d.key))
      .attr("d", (d) => line(d.values));

    // Render x axis
    gXAxis
      .attr("transform", `translate(0,${height})`)
      .call(
        d3
          .axisBottom(x)
          .tickFormat((d) => d.toLocaleString("de-CH", { month: "short" }))
      );

    // Render y axis
    gYAxis.call(
      d3
        .axisLeft(y)
        .tickFormat((d) => d.toLocaleString("de-CH", { thousands: "'" }))
        .ticks(height / 80)
    );

    // For delaunay.find
    iFound = null;
    delaunay = d3.Delaunay.from(
      flatDisplayData,
      (d) => x(d.time),
      (d) => y(d.total)
    );
    svg.on("mousemove", moved).on("mouseleave", left);
  }

  function moved() {
    const pointer = d3.clientPoint(g.node(), d3.event);
    iFound = delaunay.find(pointer[0], pointer[1]);
    const d = flatDisplayData[iFound];
    const distance = Math.hypot(
      pointer[0] - x(flatDisplayData[iFound].time),
      pointer[1] - y(flatDisplayData[iFound].total)
    );

    gFocus.style("display", null);
    focusCircle
      .attr("fill", color(d.year))
      .attr("transform", `translate(${x(d.time)},${y(d.total)})`);
    focusHorizontalLine
      .attr("x1", x(d.time))
      .attr("y1", y(d.total))
      .attr("x2", 0)
      .attr("y2", y(d.total));
    focusVerticalLine
      .attr("x1", x(d.time))
      .attr("y1", y(d.total))
      .attr("x2", x(d.time))
      .attr("y2", height);
    tooltip.style("border-color", color(d.year)).html(`
        <div>Datum: ${d.date}</div>
        <div>Total: ${d.total}</div>
      `);
    tooltip.style("display", null);

    // Position tooltip
    const padding = 6;
    const focusRect = focusCircle.node().getBoundingClientRect();
    const containerRect = selection.node().getBoundingClientRect();
    const tooltipRect = tooltip.node().getBoundingClientRect();
    let translateX =
      focusRect.x +
      focusRect.width / 2 -
      tooltipRect.width / 2 -
      containerRect.x;
    if (translateX < 0) {
      translateX = 0;
    } else if (translateX > containerRect.width - tooltipRect.width) {
      translateX = containerRect.width - tooltipRect.width;
    }
    let translateY =
      focusRect.y - padding - tooltipRect.height - containerRect.y;
    if (translateY < 0) {
      translateY = focusRect.y + focusRect.height + padding - containerRect.y;
    }
    tooltip.style("transform", `translate(${translateX}px,${translateY}px)`);
  }

  function left() {
    iFound = null;
    gFocus.style("display", "none");
    tooltip.style("display", "none");
  }

  function wrangleData(data) {
    const groupedByYear = Array.from(
      d3.rollup(
        data,
        (v) => {
          if (v.length === 1) {
            return v[0];
          } else {
            return Object.assign({}, v[0], {
              value: d3.sum(v, (d) => d.value),
              location: "CH",
            });
          }
        },
        (d) => d.year,
        (d) => d.date
      ),
      ([key, values]) => ({
        key,
        values: Array.from(values.values()),
      })
    );
    groupedByYear.forEach((d) =>
      d.values.forEach((e, i) => {
        if (i === 0) {
          e.total = e.value;
        } else {
          e.total = e.value + d.values[i - 1].total;
        }
      })
    );
    return groupedByYear;
  }

  function update(data) {
    displayData = wrangleData(data);

    const maxTotal = d3.max(
      displayData,
      (d) => d.values[d.values.length - 1].total
    );
    y.domain([0, maxTotal]);

    // For delaunay.find
    flatDisplayData = d3.merge(displayData.map((d) => d.values));

    render();
  }

  return {
    update,
  };
}
