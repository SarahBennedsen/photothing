use std::collections::HashMap;

use ::console::log;
use ::byte_order::{ByteOrder::BigEndian, BufferReader};

const SOI: u16 = 0xFFD8;
const SOF_3: u16 = 0xFFC3;
const DHT: u16 = 0xFFC4;
const EOI: u16 = 0xFFD9;
const SOS: u16 = 0xFFDA;

#[derive(Debug)]
struct Frame {
	tables: HashMap<u8,HuffmanTable>,
	precision: u8,
	y: u16,
	x: u16,
	components: Vec<Component>,
	scans: Vec<Scan>,
}

#[derive(Debug)]
struct Component {
	id: u8,
	horizonal_sampling_factor: u8,
	vertical_sampling_factor: u8,
	q_table: u8,
}

#[derive(Debug)]
struct HuffmanTable {
	destination: u8,
	number_of_codes: [u8; 16],
	values: Vec<u8>
}

#[derive(Debug)]
struct Scan {
	table_mappings: HashMap<u8, u8>,
	predictor: u8,
	point_transform: u8,
}

fn read_frame(reader: &mut BufferReader) -> Frame {
	// First, we can just read the length. We don't need it though.
	reader.read_u16();
	let precision = reader.read_u8();
	let y = reader.read_u16();
	let x = reader.read_u16();
	let component_count = reader.read_u8();

	let mut components = Vec::new();
	for _i in 0..component_count {
		let id = reader.read_u8();
		let sampling_factors = reader.read_u8();
		let q_table = reader.read_u8();

		components.push(Component {
			id: id,
			horizonal_sampling_factor: sampling_factors >> 4,
			vertical_sampling_factor: sampling_factors & 0x0F,
			q_table: q_table,
		});
	}

	let mut tables = HashMap::new();
	let mut scans = Vec::new();
	let mut next_marker = reader.read_u16();
	while next_marker != EOI {
		if next_marker == DHT {
			let table = read_huffman_table(reader);
			tables.insert(table.destination, table);
		} else if next_marker == SOS {
			let scan = read_scan(reader);
			scans.push(scan);
		} else {
			if (next_marker >> 8) == 0xFF && next_marker != 0xFFFF && next_marker != 0xFF00 {
				log(&format!("Unknown marker: {:#x?}", next_marker));
			}
		}
		next_marker = reader.read_u16();
	}

	Frame {
		tables: tables,
		precision: precision,
		y: y,
		x: x,
		components: components,
		scans: scans,
	}
}

fn read_huffman_table(reader: &mut BufferReader) -> HuffmanTable {
	let length = reader.read_u16();

	HuffmanTable {
		destination: reader.read_u8(),
		number_of_codes: [
			reader.read_u8(), reader.read_u8(), reader.read_u8(), reader.read_u8(),
			reader.read_u8(), reader.read_u8(), reader.read_u8(), reader.read_u8(),
			reader.read_u8(), reader.read_u8(), reader.read_u8(), reader.read_u8(),
			reader.read_u8(), reader.read_u8(), reader.read_u8(), reader.read_u8(),
		],
		values: {
			let mut values = Vec::new();
			for _i in 0..length - 19 {
				values.push(reader.read_u8());
			}
			values
		}
	}	
}

fn read_scan(reader: &mut BufferReader) -> Scan {
	reader.read_u16(); // Eat the length of this section.
	let component_count = reader.read_u8();
	let mut table_mappings = HashMap::new();
	for _i in 0..component_count {
		table_mappings.insert(reader.read_u8(), reader.read_u8() >> 4);
	}

	Scan {
		table_mappings: table_mappings,
		predictor: reader.read_u8(),
		point_transform: {
			reader.read_u8(); // Eat "End of spectral selection" byte
			reader.read_u8()
		},
	}
}

pub fn parse_lossless_jpeg(buffer: &[u8]) {
	let mut reader = BufferReader::new(buffer, BigEndian);
	let soi = reader.read_u16();
	if soi != SOI {
		panic!("Buffer is not a JPEG");
	}

	let sof = reader.read_u16();
	if sof != SOF_3 {
		panic!(format!("Buffer is not a Lossless JPEG {:#x?}", sof));
	}

	let frame = read_frame(&mut reader);
	log(&format!("Found {:#?}", frame));

}