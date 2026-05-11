fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let proto_file = format!("{}/../../schemas/core.proto", manifest_dir);
    let include_path = format!("{}/../../schemas", manifest_dir);
    prost_build::compile_protos(&[&proto_file][..], &[&include_path][..])?;
    Ok(())
}
