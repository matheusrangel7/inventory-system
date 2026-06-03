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
