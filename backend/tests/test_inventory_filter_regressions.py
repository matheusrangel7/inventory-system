from app.services import inventory_service


def test_numeric_spec_filter_is_limited_to_number_features():
    query = inventory_service._apply_spec_filter(
        inventory_service._base_assets_query(),
        {
            "feature_id": 1,
            "operator": "gt",
            "value": "10",
        },
    )

    compiled = str(query.compile(compile_kwargs={"literal_binds": True}))

    assert "features.feature_type = 'number'" in compiled
    assert "jsonb_typeof(asset_specs.content)" in compiled
    assert "CAST(CASE" in compiled


def test_invalid_numeric_spec_filter_value_compiles_without_json_cast():
    query = inventory_service._apply_spec_filter(
        inventory_service._base_assets_query(),
        {
            "feature_id": 1,
            "operator": "gt",
            "value": "abc",
        },
    )

    compiled = str(query.compile(compile_kwargs={"literal_binds": True}))

    assert "features.feature_type = 'number'" not in compiled
    assert "CAST(CASE" not in compiled
    assert "false" in compiled.lower()


def test_text_spec_filter_still_compiles():
    query = inventory_service._apply_spec_filter(
        inventory_service._base_assets_query(),
        {
            "feature_id": 1,
            "operator": "contains",
            "value": "Kingston",
        },
    )

    compiled = str(query.compile(compile_kwargs={"literal_binds": True}))

    assert "asset_specs.content" in compiled
    assert "LIKE" in compiled
    assert "Kingston" in compiled
