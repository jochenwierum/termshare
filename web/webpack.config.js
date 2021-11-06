process.traceDeprecation = true;

const path = require("path");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const {CleanWebpackPlugin} = require("clean-webpack-plugin");

const htmlWebpackPluginOptions = {
  scriptLoading: "defer",
};

module.exports = {
  mode: "production",
  entry: {
    audience: path.resolve(__dirname, "src/audience.ts"),
    presenter: path.resolve(__dirname, "src/presenter.ts")
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    path: path.resolve(__dirname, "../dist/static/_static"),
    filename: "[name].[contenthash].js",
    publicPath: "../_static"
  },
  optimization: {
    splitChunks: {
      chunks: "all",
    },
  },
  devtool: "source-map",
  target: "browserslist: last 2 versions and not dead and supports websockets",
  plugins: [
    new CleanWebpackPlugin(),
    new MiniCssExtractPlugin({
      filename: "[name].[contenthash].css",
    }),
    new CompressionPlugin({
      filename: "[path][name][ext].gz[query]",
      algorithm: "gzip",
      test: /\.js$|\.css$|\.html$/,
      threshold: 10240,
      minRatio: 0.8,
    }),
    new CompressionPlugin({
      filename: "[path][name][ext].br[query]",
      algorithm: "brotliCompress",
      test: /\.(js|css|html|svg)$/,
      compressionOptions: {
        level: 11,
      },
      threshold: 10240,
      minRatio: 0.8,
    }),
    new HtmlWebpackPlugin({
      ...htmlWebpackPluginOptions,
      chunks: ["audience"],
      filename: "../html/audience.html",
    }),
    new HtmlWebpackPlugin({
      ...htmlWebpackPluginOptions,
      chunks: ["presenter"],
      filename: "../html/presenter.html",
    })
  ],
  module: {
    rules: [
      {
        test: /\.(png|jpe?g|gif|svg|eot|ttf|woff|woff2)$/i,
        use: [
          {
            loader: "file-loader",
            options: {
              name: "[name].[ext]",
              outputPath: "assets/",
            },
          },
        ],
      },
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, "css-loader"]
      }
    ],
  }
};
