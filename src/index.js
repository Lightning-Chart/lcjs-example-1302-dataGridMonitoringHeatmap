const lcjs = require('@arction/lcjs')
const xydata = require('@arction/xydata')

const {
    AxisScrollStrategies,
    AxisTickStrategies,
    emptyLine,
    synchronizeAxisIntervals,
    lightningChart,
    LegendBoxBuilders,
    UIElementBuilders,
    UIOrigins,
    Themes,
} = lcjs
const { createProgressiveTraceGenerator } = xydata

const exampleTrends = [
    {
        name: 'Trend #1',
    },
    {
        name: 'Trend #2',
    },
    {
        name: 'Trend #3',
    },
]
const exampleTrendsCount = exampleTrends.length
const exampleDataCount = 50 * 1000

let license = undefined
try {
    license = LCJS_LICENSE
} catch (e) {}

// NOTE: Using `Dashboard` is no longer recommended for new applications. Find latest recommendations here: https://lightningchart.com/js-charts/docs/basic-topics/grouping-charts/
const dashboard = lightningChart({
    license: license,
})
    .Dashboard({
        theme: Themes[new URLSearchParams(window.location.search).get('theme') || 'darkGold'] || undefined
        numberOfColumns: 1,
        numberOfRows: 2,
    })
    .setRowHeight(0, 1)
    .setRowHeight(1, 0.4)
const chartXY = dashboard.createChartXY({ columnIndex: 0, rowIndex: 0 }).setTitle('Real-Time Chart + DataGrid')
const dataGrid = dashboard
    .createDataGrid({ columnIndex: 0, rowIndex: 1 })
    .setTitle('')
    .setColumnContent(0, ['', ...exampleTrends.map((trend) => trend.name)])
    .setRowContent(0, ['', 'Latest value', 'Previous value', 'value 15 s'])

const seriesXYList = exampleTrends.map((trend) =>
    chartXY
        .addLineSeries({ dataPattern: { pattern: 'ProgressiveX' } })
        .setDataCleaning({ minDataPointCount: 1 })
        .setName(trend.name),
)
const axisX = chartXY
    .getDefaultAxisX()
    .setScrollStrategy(AxisScrollStrategies.progressive)
    .setDefaultInterval((state) => ({ end: state.dataMax, start: (state.dataMax ?? 0) - 60 * 1000, stopAxisAfter: false }))
    .setTickStrategy(AxisTickStrategies.Time)

const axisXTop = chartXY
    .addAxisX({ opposite: true })
    .setTickStrategy(AxisTickStrategies.Empty)
    .setStrokeStyle(emptyLine)
    .setMouseInteractions(false)
synchronizeAxisIntervals(axisX, axisXTop)
const indicator15s = axisXTop.addCustomTick(UIElementBuilders.AxisTickMajor).setTextFormatter((_) => '-15 s')

const legend = chartXY
    .addLegendBox(LegendBoxBuilders.HorizontalLegendBox, { x: chartXY.getDefaultAxisX(), y: chartXY.getDefaultAxisY() })
    .add(chartXY)
const positionLegend = () => {
    legend.setOrigin(UIOrigins.CenterBottom).setPosition({
        x: (chartXY.getDefaultAxisX().getInterval().start + chartXY.getDefaultAxisX().getInterval().end) / 2,
        y: chartXY.getDefaultAxisY().getInterval().start,
    })
}
chartXY.forEachAxis((axis) => axis.onIntervalChange(positionLegend))

const theme = dashboard.getTheme()
const textFillGood = theme.examples.positiveTextFillStyle
const textFillBad = theme.examples.negativeTextFillStyle
const bgFillGood = theme.examples.positiveBackgroundFillStyle
const bgFillBad = theme.examples.negativeBackgroundFillStyle

Promise.all(
    new Array(exampleTrendsCount).fill(0).map((_) =>
        createProgressiveTraceGenerator()
            .setNumberOfPoints(exampleDataCount)
            .generate()
            .toPromise()
            .then((data) => data.map((xy) => 100 + xy.y)),
    ),
).then((exampleData) => {
    const trendsHistory = exampleTrends.map(() => ({
        previous: 0,
        previous15s: 0,
    }))
    const tStart = Date.now()

    const streamOneSample = (sample, isFirst) => {
        const tNow = Date.now()

        seriesXYList.forEach((series, iTrend) => series.add({ x: tNow - tStart, y: sample[iTrend] }))

        if (isFirst) {
            trendsHistory.forEach((trendHistory, iTrend) => {
                trendHistory.previous15s = sample[iTrend]
            })
            setInterval(() => {
                trendsHistory.forEach((trendHistory, iTrend) => {
                    trendHistory.previous15s = trendHistory.previous
                })
                indicator15s.setValue(Date.now() - tStart)
            }, 1000 * 15)
        }

        sample.forEach((value, iTrend) => {
            const trendHistory = trendsHistory[iTrend]
            const current = value
            const previous = trendHistory.previous
            const previous15s = trendHistory.previous15s
            dataGrid
                // Current
                .setCellContent(1, iTrend + 1, `${current.toFixed(1)}`)
                .setCellTextFillStyle(1, iTrend + 1, current > previous ? textFillGood : textFillBad)
                .setCellBackgroundFillStyle(1, iTrend + 1, current > previous ? bgFillGood : bgFillBad)
                // Previous
                .setCellContent(2, iTrend + 1, `${previous.toFixed(1)}`)
                .setCellTextFillStyle(2, iTrend + 1, previous > previous15s ? textFillGood : textFillBad)
                .setCellBackgroundFillStyle(2, iTrend + 1, previous > previous15s ? bgFillGood : bgFillBad)
                // Previous 15 s
                .setCellContent(3, iTrend + 1, `${previous15s.toFixed(1)}`)

            trendHistory.previous = current
        })
    }

    let iSample = 0
    const sub = setInterval(() => {
        streamOneSample(
            new Array(exampleTrendsCount).fill(0).map((_, iTrend) => exampleData[iTrend][iSample]),
            iSample === 0,
        )

        iSample += 1
        if (iSample >= exampleDataCount) {
            clearInterval(sub)
        }
    }, 50)
})
