//see https://linzichun.com/posts/wasm-rust-image-processing-in-webpages/
mod utils;

use image::DynamicImage;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use kmeans_colors::{get_kmeans, Kmeans, Sort};
use palette::cast::from_component_slice;
use palette::{FromColor, IntoColor, Srgb, Lab};

#[wasm_bindgen]
extern "C" {
    fn alert(s: &str);
}

#[wasm_bindgen] // this macro is required for wasm-bindgen to work, must be added to the top of the file
extern "C" {
    // to call `console.log()` of js in rust, for debugging
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

#[wasm_bindgen]
pub fn greet() {
    alert("Hello, image-analysis!");
}

#[wasm_bindgen]
pub fn add(a: i32, b: i32) -> i32 {
    return a + b;
}

#[wasm_bindgen(js_name = "Color")]
#[derive(Serialize, Deserialize)]
pub struct RgbTuple {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

//https://docs.rs/kmeans_colors/latest/kmeans_colors/

#[wasm_bindgen]
pub fn load_image_from_uint8_array(_array: &[u8]) -> JsValue {
    //pub fn load_image_from_uint8_array(data: Uint8Array, width: u32, height: u32) -> Result<Vec<u8>, JsValue> {
    // let mut buffer = Vec::new();
    // data.for_each(|byte, _| buffer.push(byte));
    // let dynamic_image = DynamicImage::from_rawbuffer(width, height, buffer)?;
    let dynamic_image: DynamicImage = image::load_from_memory(_array).unwrap();

    // let dynamic_image: DynamicImage  = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(width, height, _array.to_vec())
    //     .map(DynamicImage::ImageRgba8)
    //     .expect("Failed to create image from raw data");

    // You can now process the image or return the raw RGB data
    let rgb_data: Vec<u8> = dynamic_image.to_rgb8().into_raw();
    log(format!(
        "width {} height {}",
        dynamic_image.width(),
        dynamic_image.height()
    )
    .as_str());

    let lab: Vec<Lab> = from_component_slice::<Srgb<u8>>(&rgb_data)
        .iter()
        .map(|x| x.into_format().into_color())
        .collect();

    let mut result = Kmeans::new();
    let runs = 3;
    let k = 10;
    let max_iter = 20;
    let convergence_factor = 10.0;
    let verbose = false;
    let seed = 314;

    for i in 0..runs {
        let run_result = get_kmeans(
            k,
            max_iter,
            convergence_factor,
            verbose,
            &lab,
            seed + i as u64,
        );
        if run_result.score < result.score {
            result = run_result;
        }
    }

    let mut res = Lab::sort_indexed_colors(&result.centroids, &result.indices);

    //sort results by percentage
    res.sort_unstable_by(|a, b| (b.percentage).total_cmp(&a.percentage));

    // Convert indexed colors back to Srgb<u8> for output
    let rgb = &res
        .iter()
        .map(|x| Srgb::from_color(x.centroid).into_format())
        .collect::<Vec<Srgb<u8>>>();

    let tuples: Vec<RgbTuple> = rgb
        .into_iter()
        .map(|c| RgbTuple {
            r: c.red,
            g: c.green,
            b: c.blue,
        })
        .collect();

    // colors

    // let buffer = wasm_bindgen::memory()
    // .dyn_into::<WebAssembly::Memory>()?
    // .buffer();
    // let uint8_array = Uint8Array::new_with_byte_offset(&buffer, 0);

    // Ok(ReturnObject::new(uint8_array,  dynamic_image.width(), dynamic_image.height()))
    serde_wasm_bindgen::to_value(&tuples).unwrap()
}

// #[wasm_bindgen]
// pub fn load_image_from_buffer(buffer: Vec<u8>) -> Result<Vec<u8>, JsValue> {
//     let dynamic_image = image::load_from_memory(&buffer)?;

//     // You can now process the image or return the raw RGB data
//     let rgb_data = dynamic_image.to_rgb8().into_raw();

//     Ok(rgb_data)
// }
